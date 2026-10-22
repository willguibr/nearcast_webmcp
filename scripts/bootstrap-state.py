#!/usr/bin/env python3
"""Operator-only bootstrap for encrypted Terraform state and GitLab federation.
No credentials are persisted. CI release roles cannot run this bootstrap.
"""
import argparse
import json
import os
import re
import subprocess

def main():
    p=argparse.ArgumentParser();p.add_argument('--account',required=True);p.add_argument('--region',default='ca-central-1');args=p.parse_args()
    if not re.fullmatch('[0-9]{12}',args.account): raise ValueError('Invalid account')
    def aws(*argv):
        result=subprocess.run(['aws',*argv,'--region',args.region,'--output','json'],capture_output=True,text=True,env={**os.environ,'AWS_PAGER':''})
        if result.returncode: raise RuntimeError(result.stderr.strip())
        return json.loads(result.stdout) if result.stdout.strip() else {}
    if aws('sts','get-caller-identity')['Account']!=args.account: raise ValueError('AWS account mismatch')
    bucket=f'nearcast-webmcp-tfstate-{args.account}'
    try: aws('s3api','head-bucket','--bucket',bucket,'--expected-bucket-owner',args.account)
    except RuntimeError as error:
        if '(404)' not in str(error): raise
        aws('s3api','create-bucket','--bucket',bucket,'--create-bucket-configuration',json.dumps({'LocationConstraint':args.region}))
    aws('s3api','put-public-access-block','--bucket',bucket,'--public-access-block-configuration',json.dumps(dict.fromkeys(['BlockPublicAcls','IgnorePublicAcls','BlockPublicPolicy','RestrictPublicBuckets'],True)))
    aws('s3api','put-bucket-versioning','--bucket',bucket,'--versioning-configuration','Status=Enabled')
    aws('s3api','put-bucket-encryption','--bucket',bucket,'--server-side-encryption-configuration',json.dumps({'Rules':[{'ApplyServerSideEncryptionByDefault':{'SSEAlgorithm':'AES256'}}]}))
    policy={'Version':'2012-10-17','Statement':[{'Effect':'Deny','Principal':'*','Action':'s3:*','Resource':[f'arn:aws:s3:::{bucket}',f'arn:aws:s3:::{bucket}/*'],'Condition':{'Bool':{'aws:SecureTransport':'false'}}}]}
    aws('s3api','put-bucket-policy','--bucket',bucket,'--policy',json.dumps(policy))
    arn=f'arn:aws:iam::{args.account}:oidc-provider/gitlab.com'
    providers=aws('iam','list-open-id-connect-providers')['OpenIDConnectProviderList']
    if not any(p['Arn']==arn for p in providers):
        aws('iam','create-open-id-connect-provider','--url','https://gitlab.com','--client-id-list','sts.amazonaws.com','--tags','Key=Project,Value=nearcast-webmcp')
    existing=aws('iam','get-open-id-connect-provider','--open-id-connect-provider-arn',arn)
    if 'sts.amazonaws.com' not in existing['ClientIDList']: raise ValueError('Existing GitLab OIDC provider lacks the required audience; review before changing it')
    print(json.dumps({'stateBucket':bucket,'region':args.region,'oidcProviderArn':arn},indent=2))

if __name__=='__main__':main()
