# AWS releases

Staging: https://d3p1mb2ny0g1l0.cloudfront.net (ca-central-1, account 202719523534).
Production: https://hazards.securitygeek.io. Production bootstrap/promotion is a
separate manual step. `infra/environments/prod.json` deliberately refuses releases
until its existing infrastructure/state has been migrated and reviewed.

## Release contract

A clean source commit is built once. Backend health, frontend `release.json` and
the UI build label identify that full commit. `scripts/package-release.py` creates
a checksummed frontend + deterministic Lambda ZIP. The private, versioned S3
release archive records the immutable manifest; a retry with different bytes for
the same commit is rejected. `release.py` publishes a numbered Lambda version,
moves the `live` alias with a revision guard, uploads assets before index.html,
invalidates CloudFront, and smoke-tests public routes. It retains older hashed
assets for open browser sessions and rollback. Infrastructure never redeploys
application code or moves a live alias after creation.

The smoke check verifies matching commit IDs, frontend assets, DriveBC image CSP,
eight awareness sources, two distinct forecast coordinates (cache isolation),
river gauges and BC geocoder results. External providers can fail independently;
the awareness check requires at least one available provider and records every
source's status. A release with all sources unavailable fails. This checks
integration, not official-data completeness or emergency readiness.

On failure after switching, the previous archive and Lambda version are restored
and checked. The first staging release has no previous frontend; on failure it
restores only the provisioned API and reports failure. Production cannot begin
without a captured rollback baseline. Rollback restores the previous artifact;
it does not rebuild old source. Environment `resource_group`s serialize GitLab
jobs. Do not run a local release concurrently with a CI release.

## Build and staging deployment

Requirements: Node >=22.18, Python >=3.10, AWS CLI, Terraform >=1.10. Run in the
application directory after committing changes (the GitLab tree uses
`workload/nearcast`, the original repository uses its root):

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run build
python3 -m unittest discover -s scripts/tests
python3 scripts/package-release.py
AWS_PROFILE=default scripts/deploy.sh --config infra/environments/staging.json
```

The default package directory must not already exist. To keep earlier packages,
pass `--output /absolute/unique/path` and deploy with
`python3 scripts/release.py --config infra/environments/staging.json --release /absolute/unique/path`.
Use `scripts/deploy.sh --config infra/environments/staging.json --rollback` to
restore the preceding verified release. Logs/reports contain commit and source
status, never AWS tokens or saved place data.

## Terraform state and bootstrap

The private state bucket is `nearcast-webmcp-tfstate-202719523534`, encrypted,
versioned and public-access-blocked. Each environment uses a distinct key and
Terraform data directory. State locking uses S3 lockfiles. The operator-only
`python3 scripts/bootstrap-state.py` creates the bucket and GitLab OIDC provider
when absent; the deployment roles cannot access state or create IAM resources.

For a new staging checkout:

```sh
TF_DATA_DIR=/absolute/private/staging-tfdata terraform -chdir=infra init \
  -backend-config=bucket=nearcast-webmcp-tfstate-202719523534 \
  -backend-config=key=staging/terraform.tfstate \
  -backend-config=region=ca-central-1 -backend-config=encrypt=true \
  -backend-config=use_lockfile=true
```

Use that same `TF_DATA_DIR` for plan/apply/output. Supply staging tfvars with
`environment="staging"`, `enable_custom_domain=false`, and
`gitlab_oidc_provider_arn="arn:aws:iam::202719523534:oidc-provider/gitlab.com"`.
Review a saved plan before applying it. Never share staging's state key with prod.

Existing production state is in the original Nearcast checkout's ignored
`infra/terraform.tfstate`. Back up that state and its tfvars before migration.
Copy them to an isolated infrastructure checkout, preserve custom-domain and
origin-trial settings, and use Terraform's backend migration to
`prod/terraform.tfstate` with a separate data directory. Never initialize an
empty production state or apply a plan proposing replacement of existing IDs.
Review changes to API routes, alias integration, CSP, versioning and release IAM.
The initial alias must reference a published copy of the existing production
code; `ignore_changes` preserves its package. Confirm the version's CodeSha256
matches the currently deployed package before shifting API Gateway to the alias.

After the reviewed infrastructure bootstrap, export `release_config` into
`infra/environments/prod.json`, set `provisioned=true`, then run:

```sh
scripts/deploy.sh --config infra/environments/prod.json \
  --capture-baseline --approve-production
```

Capture copies the current Lambda ZIP and frontend into the private release
bucket without publishing a new frontend. Its `legacy-...` identity deliberately
states that the historical source commit is unknown. Only after that capture can
the first production promotion proceed. Keep the original local state backup.

## GitLab pipeline and access

The project loads CI from protected `main`, not branch-controlled YAML. Merge the
reviewed CI implementation there before expecting the new jobs to run. Build and
package occur once; staging and the manual production job use the same artifact.
Production is restricted to protected main and an explicit manual confirmation.
Repair branches have verification jobs only. The existing NWS repair MR remains
independent of this release.

GitLab ID tokens use audience `sts.amazonaws.com`. AWS trusts exact project ID
87479898, namespace 144416311, selected branch subjects, push/web/api sources,
and `maintainer`/`owner` users. Production additionally requires `ref_protected`.
GitLab's `user_access_level` claim is a lower-case role name, not the REST numeric
access level. The Duo Developer account is excluded. Credentials last only for
the job and are passed through a mode-600 temporary token file. No long-lived
AWS keys belong in CI variables.

Each role can publish only its environment's Lambda, frontend/release objects
and CloudFront invalidations. It cannot change Lambda configuration, IAM,
Terraform state, or the other environment. The operator retains infrastructure
permissions separately. No production job is usable while `provisioned=false`.

References: [GitLab AWS OIDC](https://docs.gitlab.com/ci/cloud_services/aws/),
[ID token claims](https://docs.gitlab.com/ci/secrets/id_token_authentication/),
[claim implementation](https://github.com/gitlabhq/gitlabhq/blob/master/lib/json_web_token/user_project_token_claims.rb).
