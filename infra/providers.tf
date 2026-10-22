terraform {
  required_version = ">= 1.10"
  required_providers {
    aws     = { source = "hashicorp/aws", version = ">= 5.70, < 7.0" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }
  # Initialize with an environment-specific backend config; never reuse staging's
  # state key for production. See docs/releases.md for the existing-state migration.
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
  default_tags { tags = local.tags }
  # Account automation owns these organizational tags.
  ignore_tags { keys = ["acctowner", "area", "costcenter", "domain", "envtype", "jiraname", "opsteam", "subarea"] }
}

# CloudFront certificates must live in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags { tags = local.tags }
  # Account automation owns these organizational tags.
  ignore_tags { keys = ["acctowner", "area", "costcenter", "domain", "envtype", "jiraname", "opsteam", "subarea"] }
}
