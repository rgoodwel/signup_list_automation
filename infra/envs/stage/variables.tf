variable "aws_region" {
  description = "AWS region for resources."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short project identifier."
  type        = string
  default     = "golf-league"
}

variable "bucket_name" {
  description = "Globally unique S3 bucket name for site assets."
  type        = string
}

variable "custom_domain" {
  description = "Custom domain (e.g. stage.golf.example.com). Leave empty to use CloudFront default."
  type        = string
  default     = ""
}

variable "custom_domain_aliases" {
  description = "Additional CNAMEs."
  type        = list(string)
  default     = []
}

variable "route53_zone_id" {
  description = "Route 53 zone ID. Required when custom_domain is set."
  type        = string
  default     = ""
}
