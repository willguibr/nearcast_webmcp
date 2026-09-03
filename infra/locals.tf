data "aws_caller_identity" "current" {}

locals {
  name = "${var.project_name}-${var.environment}"
  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
  frontend_bucket_name = var.frontend_bucket_name_override != "" ? var.frontend_bucket_name_override : "${local.name}-frontend-${data.aws_caller_identity.current.account_id}"
  api_origin_domain    = replace(aws_apigatewayv2_api.api.api_endpoint, "https://", "")
  aliases              = var.enable_custom_domain ? concat([var.domain_name], var.include_www ? ["www.${var.domain_name}"] : []) : []

  # External hosts the SPA needs (basemap tiles/glyphs/sprites). Documented in docs/architecture.md.
  basemap_hosts = "https://tiles.openfreemap.org"
  csp = join("; ", [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: ${local.basemap_hosts}",
    "font-src 'self' data:",
    "connect-src 'self' ${local.basemap_hosts}",
    "worker-src 'self' blob:",
    "child-src blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ])
}
