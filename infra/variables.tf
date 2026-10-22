variable "project_name" {
  type    = string
  default = "nearcast-webmcp"
}

variable "environment" {
  type    = string
  default = "prod"
  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "Use staging or prod with a separate Terraform backend key."
  }
}

variable "gitlab_oidc_provider_arn" {
  description = "Existing gitlab.com OIDC provider ARN; leave blank to omit CI release roles."
  type        = string
  default     = ""
}
variable "gitlab_project_id" {
  type    = string
  default = "87479898"
}
variable "gitlab_namespace_id" {
  type    = string
  default = "144416311"
}
variable "gitlab_project_path" {
  type    = string
  default = "securitygeekio/nearcast_webmcp"
}
variable "staging_release_refs" {
  description = "Exact branch names allowed to deploy staging. Repair branches are excluded."
  type        = list(string)
  default     = ["main", "feature/nearcast-place-awareness"]
}

variable "aws_region" {
  description = "Region for API Gateway, Lambda and the S3 bucket. CloudFront is global."
  type        = string
  default     = "ca-central-1"
}

variable "enable_custom_domain" {
  description = "When true, provisions an ACM certificate (us-east-1) and Route 53 aliases for domain_name."
  type        = bool
  default     = false
}

variable "domain_name" {
  description = "Custom domain (e.g. nearcast.example.com). Required when enable_custom_domain = true."
  type        = string
  default     = ""
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone that owns domain_name. Required when enable_custom_domain = true."
  type        = string
  default     = ""
}

variable "include_www" {
  description = "Also serve www.<domain_name> (redirect-less alias) when the custom domain is enabled."
  type        = bool
  default     = false
}

variable "frontend_bucket_name_override" {
  description = "Optional explicit S3 bucket name for the SPA. Defaults to <project>-<env>-frontend-<account id>."
  type        = string
  default     = ""
}

variable "lambda_memory_mb" {
  type    = number
  default = 512
}

variable "lambda_timeout_seconds" {
  type    = number
  default = 25
}

variable "log_level" {
  type    = string
  default = "info"
}

variable "api_cache_default_ttl" {
  description = "CloudFront default TTL (seconds) for /api/* GET responses."
  type        = number
  default     = 60
}

variable "api_cache_max_ttl" {
  type    = number
  default = 300
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "origin_trial_tokens" {
  description = "Chrome origin-trial tokens (e.g. WebMCP) sent as Origin-Trial response headers. Register at https://developer.chrome.com/origintrials/ for the application origin."
  type        = list(string)
  default     = []
}
