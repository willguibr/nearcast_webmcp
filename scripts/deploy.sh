#!/usr/bin/env bash
# Build, test, provision (Terraform) and publish Nearcast WebMCP.
# Usage: scripts/deploy.sh [--skip-tests] [--auto-approve] [--skip-terraform]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_TESTS=0; AUTO_APPROVE=""; SKIP_TF=0
for arg in "$@"; do
  case "$arg" in
    --skip-tests) SKIP_TESTS=1 ;;
    --auto-approve) AUTO_APPROVE="-auto-approve" ;;
    --skip-terraform) SKIP_TF=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

export AWS_REGION="${AWS_REGION:-ca-central-1}"
export AWS_DEFAULT_REGION="$AWS_REGION"

echo "▶ npm install"; npm install --no-audit --no-fund
if [[ $SKIP_TESTS -eq 0 ]]; then echo "▶ tests"; npm test; fi
echo "▶ build backend"; npm run build -w backend

if [[ $SKIP_TF -eq 0 ]]; then
  echo "▶ terraform"; (cd infra && terraform init -input=false && terraform apply -input=false $AUTO_APPROVE)
fi

BUCKET=$(cd infra && terraform output -raw frontend_bucket_name)
DIST_ID=$(cd infra && terraform output -raw cloudfront_distribution_id)
APP_URL=$(cd infra && terraform output -raw application_url)

echo "▶ build frontend"; npm run build -w frontend

echo "▶ upload to s3://$BUCKET"
# Hashed assets: immutable, long cache. index.html: no-cache so deploys are visible immediately.
aws s3 sync frontend/dist/assets "s3://$BUCKET/assets" --delete --cache-control "public,max-age=31536000,immutable"
aws s3 sync frontend/dist "s3://$BUCKET" --delete --exclude "assets/*" --exclude "index.html" --cache-control "public,max-age=3600"
aws s3 cp frontend/dist/index.html "s3://$BUCKET/index.html" --cache-control "no-cache,no-store,must-revalidate" --content-type "text/html; charset=utf-8"

echo "▶ invalidate CloudFront"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/index.html" "/" >/dev/null

echo "▶ smoke test"
curl -fsS "$APP_URL/api/health" && echo
echo "✅ deployed: $APP_URL"
