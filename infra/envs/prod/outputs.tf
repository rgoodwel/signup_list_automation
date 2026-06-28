output "site_url" {
  description = "Public URL for the prod site."
  value       = module.static_site.site_url
}

output "bucket_name" {
  description = "S3 bucket name."
  value       = module.static_site.bucket_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID."
  value       = module.static_site.cloudfront_distribution_id
}

output "cloudfront_domain_name" {
  description = "CloudFront *.cloudfront.net domain."
  value       = module.static_site.cloudfront_domain_name
}
