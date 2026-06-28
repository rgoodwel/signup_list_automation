terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# us-east-1 provider alias required by ACM (CloudFront certs must be in us-east-1)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
