###############################################################################
# Prod environment – S3 + CloudFront static site
###############################################################################

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    key          = "prod/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.common_tags
  }
}

locals {
  common_tags = {
    Project     = var.project_name
    Environment = "prod"
    ManagedBy   = "terraform"
    Repository  = "rgoodwel/signup_list_automation"
  }
}

module "static_site" {
  source = "../../modules/static-site"

  project_name           = var.project_name
  environment            = "prod"
  bucket_name            = var.bucket_name
  cloudfront_price_class = "PriceClass_100"
  custom_domain          = var.custom_domain
  custom_domain_aliases  = var.custom_domain_aliases
  route53_zone_id        = var.route53_zone_id
  tags                   = local.common_tags

  providers = {
    aws.us_east_1 = aws.us_east_1
  }
}
