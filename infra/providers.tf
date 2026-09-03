terraform {
  required_version = ">= 1.6"
  required_providers {
    aws     = { source = "hashicorp/aws", version = ">= 5.70, < 7.0" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }
  # Local state is intentional for the hackathon prototype (see docs/architecture.md).
  # *.tfstate is git-ignored. Move to an S3 backend if the project outlives the hackathon.
}

provider "aws" {
  region = var.aws_region
  default_tags { tags = local.tags }
}

# CloudFront certificates must live in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags { tags = local.tags }
}
