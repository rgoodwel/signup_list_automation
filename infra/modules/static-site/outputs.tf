output "bucket_name" {
  description = "S3 bucket name for app assets."
  value       = aws_s3_bucket.site.bucket
}

output "bucket_arn" {
  description = "ARN of the app S3 bucket."
  value       = aws_s3_bucket.site.arn
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (needed for cache invalidation)."
  value       = aws_cloudfront_distribution.site.id
}

output "cloudfront_domain_name" {
  description = "CloudFront default domain (*.cloudfront.net)."
  value       = aws_cloudfront_distribution.site.domain_name
}

output "cloudfront_distribution_arn" {
  description = "ARN of the CloudFront distribution."
  value       = aws_cloudfront_distribution.site.arn
}

output "site_url" {
  description = "Public URL for the site."
  value       = var.custom_domain != "" ? "https://${var.custom_domain}" : "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "acm_certificate_arn" {
  description = "ACM certificate ARN (empty if no custom domain)."
  value       = var.custom_domain != "" ? aws_acm_certificate.site[0].arn : ""
}
