# Private release archives are separate from the publicly served frontend bucket.
resource "aws_s3_bucket" "releases" {
  bucket        = "${local.name}-releases-${data.aws_caller_identity.current.account_id}"
  force_destroy = false
}
resource "aws_s3_bucket_public_access_block" "releases" {
  bucket                  = aws_s3_bucket.releases.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_versioning" "releases" {
  bucket = aws_s3_bucket.releases.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "releases" {
  bucket = aws_s3_bucket.releases.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_policy" "releases" {
  bucket = aws_s3_bucket.releases.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect    = "Deny", Principal = "*", Action = "s3:*",
    Resource  = [aws_s3_bucket.releases.arn, "${aws_s3_bucket.releases.arn}/*"],
    Condition = { Bool = { "aws:SecureTransport" = "false" } }
  }] })
}

resource "aws_iam_role" "gitlab_release" {
  count                = var.gitlab_oidc_provider_arn != "" ? 1 : 0
  name                 = "${local.name}-gitlab-release"
  max_session_duration = 3600
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect = "Allow", Principal = { Federated = var.gitlab_oidc_provider_arn }, Action = "sts:AssumeRoleWithWebIdentity",
    Condition = { StringEquals = merge({
      "gitlab.com:aud"               = "sts.amazonaws.com",
      "gitlab.com:project_id"        = var.gitlab_project_id,
      "gitlab.com:namespace_id"      = var.gitlab_namespace_id,
      "gitlab.com:user_access_level" = ["maintainer", "owner"],
      "gitlab.com:pipeline_source"   = ["push", "web", "api"],
      "gitlab.com:sub"               = [for ref in(var.environment == "prod" ? ["main"] : var.staging_release_refs) : "project_path:${var.gitlab_project_path}:ref_type:branch:ref:${ref}"]
    }, var.environment == "prod" ? { "gitlab.com:ref_protected" = "true" } : {}) }
  }] })
}
resource "aws_iam_role_policy" "gitlab_release" {
  count = var.gitlab_oidc_provider_arn != "" ? 1 : 0
  role  = aws_iam_role.gitlab_release[0].id
  name  = "publish-nearcast-release"
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:ListBucket", "s3:GetBucketLocation"], Resource = [aws_s3_bucket.frontend.arn, aws_s3_bucket.releases.arn] },
    { Effect = "Allow", Action = ["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject"], Resource = ["${aws_s3_bucket.frontend.arn}/*", "${aws_s3_bucket.releases.arn}/*"] },
    { Effect = "Allow", Action = ["lambda:GetFunction", "lambda:GetFunctionConfiguration", "lambda:UpdateFunctionCode", "lambda:PublishVersion", "lambda:GetAlias", "lambda:UpdateAlias", "lambda:ListVersionsByFunction"], Resource = [aws_lambda_function.api.arn, "${aws_lambda_function.api.arn}:*"] },
    { Effect = "Allow", Action = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"], Resource = [aws_cloudfront_distribution.app.arn] }
  ] })
}
output "release_config" {
  value = {
    account         = data.aws_caller_identity.current.account_id
    region          = var.aws_region
    environment     = var.environment
    bucket          = aws_s3_bucket.frontend.id
    releases_bucket = aws_s3_bucket.releases.id
    distribution    = aws_cloudfront_distribution.app.id
    function        = aws_lambda_function.api.function_name
    alias           = aws_lambda_alias.live.name
    url             = var.enable_custom_domain ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.app.domain_name}"
    role_arn        = try(aws_iam_role.gitlab_release[0].arn, "")
  }
}
