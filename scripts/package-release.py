#!/usr/bin/env python3
"""Package already-tested builds; one immutable artifact is promoted between environments."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def package(destination):
    commit = json.loads((ROOT / 'backend/dist/release.json').read_text())['commit']
    frontend = json.loads((ROOT / 'frontend/dist/release.json').read_text())['commit']
    if not re.fullmatch(r'[a-f0-9]{40}', commit) or commit != frontend:
        raise ValueError('Backend and frontend must identify the same full source commit')
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    if commit != head or subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=no'], cwd=ROOT, text=True).strip():
        raise ValueError('Build a clean, committed checkout before packaging a release')
    destination.mkdir(parents=True, exist_ok=False)
    shutil.copytree(ROOT / 'frontend/dist', destination / 'frontend')
    with zipfile.ZipFile(destination / 'api.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted((ROOT / 'backend/dist').rglob('*')):
            if path.is_symlink(): raise ValueError('Symlinks are not release files')
            if path.is_file():
                info = zipfile.ZipInfo(path.relative_to(ROOT / 'backend/dist').as_posix(), (2020,1,1,0,0,0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, path.read_bytes())
    files = {}
    for path in sorted(destination.rglob('*')):
        if path.is_symlink(): raise ValueError('Symlinks are not release files')
        if path.is_file(): files[path.relative_to(destination).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    (destination / 'manifest.json').write_text(json.dumps({'schemaVersion':1,'commit':commit,'files':files}, indent=2)+'\n')
    print(f'Packaged {commit}: {len(files)} verified files', flush=True)

if __name__ == '__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,default=ROOT/'release');args=p.parse_args()
    package(args.output.resolve())
