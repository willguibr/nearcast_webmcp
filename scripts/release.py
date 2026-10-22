#!/usr/bin/env python3
"""Publish a verified archive, shift the Lambda alias, smoke test, and restore on failure.

Infrastructure is provisioned separately. This process has no IAM or Terraform permissions.
GitLab serializes each environment with a resource_group. Local operators must avoid
concurrent releases. Secrets are passed in environment/token files, never printed.
"""
import argparse
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.request
from urllib.parse import urlparse
from smoke import smoke

def verify_release(folder):
    manifest=json.loads((folder/'manifest.json').read_text())
    identity_ok = re.fullmatch('[a-f0-9]{40}',manifest.get('commit','')) or (manifest.get('legacy') is True and re.fullmatch('legacy-[a-f0-9]{16}',manifest.get('commit','')))
    if manifest.get('schemaVersion')!=1 or not identity_ok: raise ValueError('Invalid release identity')
    files=manifest.get('files',{})
    if not {'api.zip','frontend/index.html','frontend/release.json'}.issubset(files): raise ValueError('Incomplete release')
    actual={p.relative_to(folder).as_posix() for p in folder.rglob('*') if p.is_file() and p!=folder/'manifest.json'}
    if actual!=set(files): raise ValueError('Unexpected or missing release files')
    for name,digest in files.items():
        path=folder/name
        if path.is_symlink() or not path.resolve().is_relative_to(folder.resolve()) or hashlib.sha256(path.read_bytes()).hexdigest()!=digest:
            raise ValueError('Release checksum mismatch: '+name)
    return manifest

class Publisher:
    def __init__(self, config): self.config=config
    def aws(self,*args):
        result=subprocess.run(['aws',*args,'--region',self.config['region'],'--output','json'],text=True,capture_output=True,
                              env={**os.environ,'AWS_PAGER':'','AWS_EC2_METADATA_DISABLED':'true'})
        if result.returncode: raise RuntimeError(result.stderr.strip())
        return json.loads(result.stdout) if result.stdout.strip() else {}
    def get_json(self,key):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'value.json'
            try: self.aws('s3api','get-object','--bucket',self.config['releases_bucket'],'--key',key,str(path))
            except RuntimeError as error:
                if 'NoSuchKey' in str(error) or '(404)' in str(error): return None
                raise
            return json.loads(path.read_text())
    def put_json(self,key,value):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'value.json';path.write_text(json.dumps(value,indent=2)+'\n')
            self.aws('s3api','put-object','--bucket',self.config['releases_bucket'],'--key',key,'--body',str(path),'--content-type','application/json')
    def capture_baseline(self):
        if self.get_json('current.json'): raise ValueError('A managed release already exists; baseline capture cannot replace it')
        alias=self.aws('lambda','get-alias','--function-name',self.config['function'],'--name',self.config['alias'])
        function=self.aws('lambda','get-function','--function-name',self.config['function'],'--qualifier',alias['FunctionVersion'])
        location=function['Code']['Location'];parsed=urlparse(location)
        if parsed.scheme!='https' or not (parsed.hostname or '').endswith('.amazonaws.com'): raise ValueError('Unexpected AWS code download host')
        with urllib.request.urlopen(self.config['url']+'/api/health',timeout=30) as response: version=json.load(response).get('version')
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)/'baseline';folder.mkdir();(folder/'frontend').mkdir()
            with urllib.request.urlopen(location,timeout=60) as response: code=response.read()
            (folder/'api.zip').write_bytes(code)
            self.aws('s3','cp',f"s3://{self.config['bucket']}/",str(folder/'frontend'),'--recursive','--only-show-errors')
            if not (folder/'frontend/index.html').is_file(): raise ValueError('No deployed frontend to capture')
            identity='legacy-'+hashlib.sha256(code+(folder/'frontend/index.html').read_bytes()).hexdigest()[:16]
            (folder/'frontend/release.json').write_text(json.dumps({'commit':identity,'legacy':True,'sourceCommit':'unknown'})+'\n')
            files={p.relative_to(folder).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(folder.rglob('*')) if p.is_file()}
            manifest={'schemaVersion':1,'commit':identity,'legacy':True,'files':files}
            (folder/'manifest.json').write_text(json.dumps(manifest));verify_release(folder)
            for name in files: self.aws('s3api','put-object','--bucket',self.config['releases_bucket'],'--key',f'releases/{identity}/{name}','--body',str(folder/name))
            self.put_json(f'releases/{identity}/manifest.json',manifest)
            self.put_json('current.json',{'commit':identity,'lambdaVersion':alias['FunctionVersion'],'apiVersion':version,'legacy':True,'previous':None})
        return {'status':'BASELINE_CAPTURED','releaseId':identity,'sourceCommit':'unknown','apiVersion':version,'lambdaVersion':alias['FunctionVersion'],'url':self.config['url']}
    def invalidate(self):
        result=self.aws('cloudfront','create-invalidation','--distribution-id',self.config['distribution'],'--paths','/','/index.html','/release.json','/api/*')
        print('Waiting for CloudFront invalidation',flush=True)
        self.aws('cloudfront','wait','invalidation-completed','--distribution-id',self.config['distribution'],'--id',result['Invalidation']['Id'])
    def upload_frontend(self,folder):
        # Retain content-addressed assets for open clients and previous releases.
        files=sorted(p for p in (folder/'frontend').rglob('*') if p.is_file())
        files.sort(key=lambda p:p.name=='index.html')
        for path in files:
            key=path.relative_to(folder/'frontend').as_posix()
            cache='public,max-age=31536000,immutable' if key.startswith('assets/') else 'no-cache,no-store,must-revalidate'
            self.aws('s3api','put-object','--bucket',self.config['bucket'],'--key',key,'--body',str(path),'--content-type',mimetypes.guess_type(key)[0] or 'application/octet-stream','--cache-control',cache)
    def restore(self,previous):
        print('Restoring previous Lambda alias and frontend release',flush=True)
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)/'release';folder.mkdir()
            self.aws('s3','cp',f"s3://{self.config['releases_bucket']}/releases/{previous['commit']}/",str(folder),'--recursive','--only-show-errors')
            verify_release(folder)
            self.aws('lambda','update-alias','--function-name',self.config['function'],'--name',self.config['alias'],'--function-version',previous['lambdaVersion'])
            self.upload_frontend(folder)
        self.invalidate()
        report=smoke(self.config['url'],previous['commit'],previous.get('apiVersion') if previous.get('legacy') else None)
        self.put_json('current.json',previous)
        return report
    def publish(self,folder):
        manifest=verify_release(folder);commit=manifest['commit'];previous=self.get_json('current.json')
        if manifest.get('legacy'): raise ValueError('Legacy captures are only usable through rollback')
        existing=self.get_json(f'releases/{commit}/manifest.json')
        if existing and existing!=manifest: raise ValueError('Immutable release already exists with different content')
        if previous and previous.get('commit') == commit:
            # Retrying a completed job must not create a self-referential rollback.
            return smoke(self.config['url'],commit)
        if self.config['environment']=='prod' and not previous:
            raise ValueError('Production requires a captured rollback baseline before its first managed release; see docs/releases.md')
        if not existing:
            print('Archiving verified release '+commit,flush=True)
            # Manifest is written last, so an interrupted archive can be retried safely.
            for name in manifest['files']:
                self.aws('s3api','put-object','--bucket',self.config['releases_bucket'],'--key',f'releases/{commit}/{name}','--body',str(folder/name))
            self.put_json(f'releases/{commit}/manifest.json',manifest)
        alias=self.aws('lambda','get-alias','--function-name',self.config['function'],'--name',self.config['alias'])
        switched=False
        try:
            print('Publishing Lambda version',flush=True)
            result=self.aws('lambda','update-function-code','--function-name',self.config['function'],'--zip-file','fileb://'+str((folder/'api.zip').resolve()),'--publish')
            self.aws('lambda','wait','function-updated-v2','--function-name',self.config['function'])
            version=result['Version']
            self.aws('lambda','update-alias','--function-name',self.config['function'],'--name',self.config['alias'],'--function-version',version,'--revision-id',alias['RevisionId'])
            switched=True
            print('Publishing frontend assets and entry page',flush=True);self.upload_frontend(folder);self.invalidate()
            report=smoke(self.config['url'],commit)
            current={'commit':commit,'lambdaVersion':version,'previous':previous}
            self.put_json(f'evidence/{commit}.json',report);self.put_json('current.json',current)
            return report
        except Exception:
            if switched:
                if previous: self.restore(previous)
                else:
                    # First staging deployment has no prior frontend. Restore its
                    # provisioned API, report failure, and require a new deploy.
                    self.aws('lambda','update-alias','--function-name',self.config['function'],'--name',self.config['alias'],'--function-version',alias['FunctionVersion'])
                    self.invalidate()
            raise

def main():
    p=argparse.ArgumentParser();p.add_argument('--config',type=Path,required=True);p.add_argument('--release',type=Path);p.add_argument('--rollback',action='store_true');p.add_argument('--capture-baseline',action='store_true');p.add_argument('--approve-production',action='store_true');p.add_argument('--report',type=Path,default=Path('release-report.json'));args=p.parse_args()
    config=json.loads(args.config.read_text())
    if config.get('provisioned') is False: raise ValueError('Environment bootstrap is pending; see docs/releases.md')
    if config['environment']=='prod' and not args.approve_production: raise ValueError('Production requires the manual approval flag')
    if not re.fullmatch('[0-9]{12}',config['account']) or config['environment'] not in ('staging','prod'): raise ValueError('Invalid deployment config')
    publisher=Publisher(config)
    if publisher.aws('sts','get-caller-identity')['Account']!=config['account']: raise ValueError('AWS account mismatch')
    if sum([bool(args.release),args.rollback,args.capture_baseline])!=1: raise ValueError('Choose exactly one release operation')
    if args.capture_baseline: report=publisher.capture_baseline()
    elif args.rollback:
        current=publisher.get_json('current.json')
        if not current or not current.get('previous'): raise ValueError('No previous managed release available')
        report=publisher.restore(current['previous'])
    elif args.release: report=publisher.publish(args.release.resolve())
    else: raise ValueError('Choose --release or --rollback')
    args.report.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))

if __name__=='__main__': main()
