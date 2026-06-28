###############################################################################
# Module: static-site
#
# Creates:
#   - Private S3 bucket for app assets
#   - CloudFront distribution with OAC (Origin Access Control)
#   - Optional ACM certificate + Route 53 alias (when custom_domain is set)
###############################################################################

###############################################################################
# S3 bucket – private origin
###############################################################################
resource "aws_s3_bucket" "site" {
  bucket = var.bucket_name

  tags = merge(var.tags, {
    Name = var.bucket_name
  })
}

resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

###############################################################################
# CloudFront Origin Access Control (OAC) – modern replacement for OAI
###############################################################################
resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.project_name}-${var.environment}-oac"
  description                       = "OAC for ${var.project_name} ${var.environment}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

###############################################################################
# S3 bucket policy – allow CloudFront OAC only
###############################################################################
data "aws_iam_policy_document" "site_bucket" {
  statement {
    sid    = "AllowCloudFrontOAC"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site_bucket.json

  # Policy depends on the distribution existing first
  depends_on = [aws_cloudfront_distribution.site]
}

###############################################################################
# ACM certificate (us-east-1 required for CloudFront)
# Only created when custom_domain is non-empty.
###############################################################################
resource "aws_acm_certificate" "site" {
  count = var.custom_domain != "" ? 1 : 0

  provider          = aws.us_east_1
  domain_name       = var.custom_domain
  validation_method = "DNS"

  subject_alternative_names = var.custom_domain_aliases

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-cert"
  })
}

###############################################################################
# Route 53 certificate validation records
###############################################################################
resource "aws_route53_record" "cert_validation" {
  for_each = var.custom_domain != "" ? {
    for dvo in aws_acm_certificate.site[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id = var.route53_zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "site" {
  count = var.custom_domain != "" ? 1 : 0

  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.site[0].arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

###############################################################################
# CloudFront distribution
###############################################################################
locals {
  s3_origin_id    = "${var.project_name}-${var.environment}-s3"
  viewer_cert     = var.custom_domain != "" ? {
    acm_certificate_arn      = aws_acm_certificate_validation.site[0].certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  } : null
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = var.cloudfront_price_class
  comment             = "${var.project_name} ${var.environment}"

  aliases = var.custom_domain != "" ? concat([var.custom_domain], var.custom_domain_aliases) : []

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = local.s3_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized (managed)
    origin_request_policy_id   = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf" # CORS-S3Origin (managed)
    response_headers_policy_id = aws_cloudfront_response_headers_policy.site.id
  }

  # SPA routing – return index.html for 403/404 so React Router works
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  dynamic "viewer_certificate" {
    for_each = var.custom_domain != "" ? [1] : []
    content {
      acm_certificate_arn      = local.viewer_cert.acm_certificate_arn
      ssl_support_method       = local.viewer_cert.ssl_support_method
      minimum_protocol_version = local.viewer_cert.minimum_protocol_version
    }
  }

  dynamic "viewer_certificate" {
    for_each = var.custom_domain == "" ? [1] : []
    content {
      cloudfront_default_certificate = true
    }
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-cf"
  })
}

###############################################################################
# CloudFront Response Headers Policy – security headers
###############################################################################
resource "aws_cloudfront_response_headers_policy" "site" {
  name    = "${var.project_name}-${var.environment}-security-headers"
  comment = "Security headers for ${var.project_name} ${var.environment}"

  security_headers_config {
    content_security_policy {
      content_security_policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self';"
      override                = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }
  }
}

###############################################################################
# Route 53 alias (optional custom domain)
###############################################################################
resource "aws_route53_record" "site" {
  count = var.custom_domain != "" && var.route53_zone_id != "" ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.custom_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}
