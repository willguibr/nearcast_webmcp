import io
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from release import Publisher, verify_release

SHA='a'*40
CONFIG={'environment':'staging','region':'ca-central-1','account':'123456789012','function':'test-api','alias':'live','distribution':'TEST','bucket':'test-frontend','releases_bucket':'test-releases','url':'https://example.test'}

def artifact(folder):
    (folder/'frontend/assets').mkdir(parents=True)
    for name,content in {'api.zip':b'zip','frontend/index.html':b'<script src="/assets/a.js"></script>','frontend/assets/a.js':b'code','frontend/release.json':json.dumps({'commit':SHA}).encode()}.items():
        (folder/name).write_bytes(content)
    manifest={'schemaVersion':1,'commit':SHA,'files':{p.relative_to(folder).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.rglob('*') if p.is_file()}}
    (folder/'manifest.json').write_text(json.dumps(manifest))
    return manifest

class FakePublisher(Publisher):
    def __init__(self, previous=None, config=None):
        super().__init__(config or CONFIG);self.calls=[];self.objects={'current.json':previous};self.restored=None
    def aws(self,*args):
        self.calls.append(args)
        if args[:2]==('lambda','get-alias'):return {'FunctionVersion':'3','RevisionId':'old-revision'}
        if args[:2]==('lambda','update-function-code'):return {'Version':'4'}
        return {}
    def get_json(self,key):return self.objects.get(key)
    def put_json(self,key,value):self.objects[key]=value
    def invalidate(self):self.calls.append(('invalidate',))
    def restore(self,previous):self.restored=previous;return {'status':'PASS'}

class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.folder=Path(self.tmp.name);self.manifest=artifact(self.folder)
    def tearDown(self):self.tmp.cleanup()
    def test_checksum_and_extra_file_fail_before_cloud_mutation(self):
        self.assertEqual(verify_release(self.folder)['commit'],SHA)
        (self.folder/'frontend/assets/a.js').write_text('tampered')
        with self.assertRaisesRegex(ValueError,'checksum'):verify_release(self.folder)
        publisher=FakePublisher()
        with self.assertRaises(ValueError):publisher.publish(self.folder)
        self.assertEqual(publisher.calls,[])
    def test_extra_nested_manifest_is_not_silently_ignored(self):
        (self.folder/'frontend/manifest.json').write_text('{}')
        with self.assertRaisesRegex(ValueError,'Unexpected'):verify_release(self.folder)
    def test_symlink_rejected(self):
        path=self.folder/'api.zip';path.unlink();path.symlink_to(self.folder/'frontend/assets/a.js')
        with self.assertRaises(ValueError):verify_release(self.folder)
    def test_immutable_archive_cannot_be_replaced(self):
        publisher=FakePublisher();publisher.objects[f'releases/{SHA}/manifest.json']={'different':True}
        with self.assertRaisesRegex(ValueError,'Immutable'):publisher.publish(self.folder)
        self.assertEqual(publisher.calls,[])
    def test_first_production_release_requires_baseline(self):
        publisher=FakePublisher(config={**CONFIG,'environment':'prod'})
        with self.assertRaisesRegex(ValueError,'rollback baseline'):publisher.publish(self.folder)
        self.assertEqual(publisher.calls,[])
    @patch('release.smoke',return_value={'status':'PASS'})
    def test_alias_switch_waits_for_published_version_and_retains_old_assets(self,smoke):
        previous={'commit':'b'*40,'lambdaVersion':'3'};publisher=FakePublisher(previous)
        publisher.publish(self.folder)
        verbs=[c[:2] for c in publisher.calls]
        self.assertLess(verbs.index(('lambda','wait')),verbs.index(('lambda','update-alias')))
        alias=next(c for c in publisher.calls if c[:2]==('lambda','update-alias'))
        self.assertIn('old-revision',alias);self.assertIn('4',alias)
        self.assertFalse(any('delete' in c or '--delete' in c for c in publisher.calls))
        uploads=[c for c in publisher.calls if c[:2]==('s3api','put-object') and CONFIG['bucket'] in c]
        self.assertEqual(uploads[-1][uploads[-1].index('--key')+1],'index.html')
        self.assertEqual(publisher.objects['current.json']['previous'],previous)
        smoke.assert_called_once_with(CONFIG['url'],SHA)
    @patch('release.smoke',side_effect=ValueError('bad release'))
    def test_failed_smoke_restores_previous_release_and_does_not_advance_pointer(self,_):
        previous={'commit':'b'*40,'lambdaVersion':'3'};publisher=FakePublisher(previous)
        with self.assertRaisesRegex(ValueError,'bad release'):publisher.publish(self.folder)
        self.assertEqual(publisher.restored,previous);self.assertEqual(publisher.objects['current.json'],previous)
    @patch('release.smoke',side_effect=ValueError('bad release'))
    def test_failed_first_staging_release_restores_provisioned_alias(self,_):
        publisher=FakePublisher()
        with self.assertRaises(ValueError):publisher.publish(self.folder)
        switches=[c for c in publisher.calls if c[:2]==('lambda','update-alias')]
        self.assertEqual(switches[-1][-1],'3');self.assertIsNone(publisher.objects['current.json'])

class BaselineTests(unittest.TestCase):
    @patch('release.urllib.request.urlopen')
    def test_capture_preserves_old_code_without_mutating_live_resources(self, urlopen):
        urlopen.side_effect = [io.BytesIO(b'{"version":"0.1.0"}'),io.BytesIO(b'old lambda code')]
        publisher = FakePublisher()
        original_aws = publisher.aws
        def aws(*args):
            if args[:2] == ('lambda','get-function'):
                publisher.calls.append(args)
                return {'Code':{'Location':'https://download.s3.ca-central-1.amazonaws.com/code.zip'}}
            if args[:2] == ('s3','cp'):
                destination = Path(args[3]); (destination/'index.html').write_text('old frontend')
                publisher.calls.append(args); return {}
            return original_aws(*args)
        publisher.aws=aws
        report=publisher.capture_baseline()
        self.assertEqual(report['status'],'BASELINE_CAPTURED')
        self.assertEqual(report['sourceCommit'],'unknown')
        self.assertEqual(report['lambdaVersion'],'3')
        self.assertTrue(report['releaseId'].startswith('legacy-'))
        self.assertFalse(any(c[:2] == ('lambda','update-alias') for c in publisher.calls))
        uploads=[c for c in publisher.calls if c[:2] == ('s3api','put-object')]
        self.assertTrue(uploads)
        self.assertTrue(all(CONFIG['releases_bucket'] in c for c in uploads))
        self.assertEqual(publisher.objects['current.json']['apiVersion'],'0.1.0')
    @patch('release.smoke',return_value={'status':'PASS'})
    def test_completed_release_retry_is_idempotent(self, smoke):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);manifest=artifact(folder)
            previous={'commit':SHA,'lambdaVersion':'4','previous':{'commit':'b'*40}}
            publisher=FakePublisher(previous)
            publisher.objects[f'releases/{SHA}/manifest.json']=manifest
            publisher.publish(folder)
            self.assertEqual(publisher.calls,[])
            self.assertEqual(publisher.objects['current.json'],previous)
    def test_baseline_cannot_overwrite_a_managed_release(self):
        publisher=FakePublisher({'commit':SHA})
        with self.assertRaisesRegex(ValueError,'already exists'):publisher.capture_baseline()
        self.assertEqual(publisher.calls,[])

if __name__=='__main__':unittest.main()

