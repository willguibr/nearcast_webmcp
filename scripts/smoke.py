#!/usr/bin/env python3
"""Exercise public CloudFront routes and source contracts, not just Lambda health."""
import json
import re
import urllib.request

def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'Nearcast-release-smoke/1.0'}), timeout=35) as r:
        return r.read(), dict(r.headers.items())

def smoke(url, commit, legacy_version=None):
    def document(path): return json.loads(fetch(url.rstrip('/')+path)[0])
    health=document('/api/health')
    if health.get('status')!='ok' or health.get('version')!=(legacy_version or commit): raise ValueError('API is not serving the expected commit/version')
    if document('/release.json').get('commit')!=commit: raise ValueError('Frontend is not serving the expected commit')
    html,headers=fetch(url)
    csp=next((v for k,v in headers.items() if k.lower()=='content-security-policy'),'')
    img=next((part for part in csp.split(';') if part.strip().startswith('img-src ')),'')
    if 'https://www.drivebc.ca' not in img: raise ValueError('DriveBC images are blocked by CSP')
    assets=set(re.findall(r'(?:src|href)="(/assets/[^"?]+)"',html.decode()))
    if not assets: raise ValueError('No built frontend assets in index')
    for asset in assets: fetch(url.rstrip('/')+asset)
    if legacy_version:
        return {'status':'PASS','releaseId':commit,'legacy':True,'apiVersion':legacy_version,'sourceCommit':'unknown','assetCount':len(assets),'url':url,'note':'Legacy rollback checked for API health and frontend assets; new feature endpoints are not expected.'}
    awareness=document('/api/awareness')
    required={'eccc-aqhi','bc-evacuations','drivebc-roads','drivebc-cameras','bc-bans','bc-restrictions','bc-wildfires','bc-floods'}
    if {s['id'] for s in awareness.get('sources',[])}!=required or awareness.get('demo') is not False: raise ValueError('Unexpected awareness source contract')
    if not any(s['status'] in ('available','partial') for s in awareness['sources']): raise ValueError('All awareness providers unavailable')
    forecasts=[document('/api/forecast?lat='+lat+'&lon=-123.15') for lat in ('49.7','50')]
    if [f.get('latitude') for f in forecasts]!=[49.7,50] or not all(f.get('periods') for f in forecasts): raise ValueError('Forecast cache or coordinates mismatch')
    gauges=document('/api/gauges?lat=49.7&lon=-123.15&radiusKm=25')
    if not isinstance(gauges.get('gauges'),list): raise ValueError('Invalid gauge response')
    search=document('/api/places/search?q=Squamish')
    if not search.get('results'): raise ValueError('BC geocoder smoke test returned no matches')
    return {'commit':commit,'url':url,'status':'PASS','assetCount':len(assets),'sources':[{k:s[k] for k in ('id','status','count')} for s in awareness['sources']],
            'forecastPeriods':len(forecasts[0]['periods']),'riverGauges':len(gauges['gauges']),'searchMatches':len(search['results'])}

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('url');p.add_argument('commit');a=p.parse_args()
    print(json.dumps(smoke(a.url,a.commit),indent=2))
