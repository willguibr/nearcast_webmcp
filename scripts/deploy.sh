#!/usr/bin/env bash
# Deploy an already-tested, immutable release. Infrastructure has a separate plan/apply.
# Usage: scripts/deploy.sh --config infra/environments/staging.json [--rollback]
# Production also requires --approve-production, normally supplied by the manual CI job.
set -euo pipefail
APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARGS=("$@")
if [[ " $* " != *" --rollback "* && " $* " != *" --capture-baseline "* ]]; then
  ARGS+=(--release "$APP_ROOT/release")
fi
exec python3 "$APP_ROOT/scripts/release.py" "${ARGS[@]}"
