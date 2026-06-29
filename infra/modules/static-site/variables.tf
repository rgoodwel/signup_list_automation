variable "project_name" {
  description = "Short project name used in resource names and tags."
  type        = string
}

variable "environment" {
  description = "Environment label: dev | prod."
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be one of: dev, prod."
  }
}

variable "bucket_name" {
  description = "Globally unique S3 bucket name for site assets."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9\\-]{1,61}[a-z0-9]$", var.bucket_name))
    error_message = "bucket_name must be lowercase, 3-63 chars, alphanumeric + hyphens."
  }
}

variable "cloudfront_price_class" {
  description = "CloudFront price class. PriceClass_100 = US/EU only (cheapest)."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_All", "PriceClass_200", "PriceClass_100"], var.cloudfront_price_class)
    error_message = "Must be PriceClass_All, PriceClass_200, or PriceClass_100."
  }
}

variable "custom_domain" {
  description = "Custom domain (e.g. golf.example.com). Leave empty to use CloudFront default *.cloudfront.net."
  type        = string
  default     = ""
}

variable "custom_domain_aliases" {
  description = "Additional CNAMEs for the CloudFront distribution (e.g. www.golf.example.com)."
  type        = list(string)
  default     = []
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID. Required only when custom_domain is set."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
