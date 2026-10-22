#!/usr/bin/env bash
# Runs only in explicitly selected GitLab deployment jobs. Never echo the JWT.
set -euo pipefail
APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${1:?release config path required}"
ACTION="${2:-deploy}"
TOKEN_FILE="$(mktemp)"
chmod 600 "$TOKEN_FILE"
trap 'rm -f "$TOKEN_FILE"' EXIT
printf '%s' "${GITLAB_OIDC_TOKEN:?GitLab ID token missing}" > "$TOKEN_FILE"
unset GITLAB_OIDC_TOKEN
export AWS_WEB_IDENTITY_TOKEN_FILE="$TOKEN_FILE"
export AWS_ROLE_ARN
AWS_ROLE_ARN="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["role_arn"])' "$CONFIG")"
export AWS_ROLE_SESSION_NAME="nearcast-${CI_PIPELINE_ID:?}-${CI_JOB_ID:?}"
export AWS_EC2_METADATA_DISABLED=true AWS_PAGER=''
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_PROFILE
ARGS=(--config "$CONFIG" --report "$APP_ROOT/release-report.json")
if [[ "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["environment"])' "$CONFIG")" == prod ]]; then
  [[ "${CI_COMMIT_BRANCH:-}" == main && "${CI_COMMIT_REF_PROTECTED:-}" == true ]] || { echo 'Production requires protected main' >&2; exit 1; }
  ARGS+=(--approve-production)
fi
if [[ "$ACTION" == rollback ]]; then ARGS+=(--rollback)
elif [[ "$ACTION" == deploy ]]; then ARGS+=(--release "$APP_ROOT/release")
else echo 'Unknown release action' >&2; exit 2
fi
python3 "$APP_ROOT/scripts/release.py" "${ARGS[@]}"
