provider "aws" {
  region = var.aws_region
}

# CloudFront certificates must live in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

# The hosted zone is owned by the clouddevopslearningblog repo — we only read it
# here and add one record for this subdomain.
data "aws_route53_zone" "hosted_zone" {
  name         = var.hosted_zone_name
  private_zone = false
}

locals {
  tags = { Project = var.project }
}

# ── S3: private origin bucket ────────────────────────────────────────────────
resource "aws_s3_bucket" "site" {
  bucket        = var.site_domain
  force_destroy = true
  tags          = local.tags
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_identity" "site" {
  comment = "OAI for ${var.site_domain}"
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOAIRead"
      Effect    = "Allow"
      Principal = { AWS = aws_cloudfront_origin_access_identity.site.iam_arn }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.site.arn}/*"
    }]
  })
}

# ── ACM: certificate for the subdomain (DNS-validated) ───────────────────────
resource "aws_acm_certificate" "site" {
  provider          = aws.us_east_1
  domain_name       = var.site_domain
  validation_method = "DNS"
  tags              = local.tags
  lifecycle { create_before_destroy = true }
}

resource "aws_route53_record" "cert_validation" {
  zone_id = data.aws_route53_zone.hosted_zone.zone_id
  name    = tolist(aws_acm_certificate.site.domain_validation_options)[0].resource_record_name
  type    = tolist(aws_acm_certificate.site.domain_validation_options)[0].resource_record_type
  ttl     = 60
  records = [tolist(aws_acm_certificate.site.domain_validation_options)[0].resource_record_value]
}

resource "aws_acm_certificate_validation" "site" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [aws_route53_record.cert_validation.fqdn]
}

# ── CloudFront ──────────────────────────────────────────────────────────────
resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Static site for ${var.site_domain}"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  aliases             = [var.site_domain]
  tags                = local.tags

  origin {
    domain_name = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id   = "s3-${aws_s3_bucket.site.id}"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.site.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    target_origin_id       = "s3-${aws_s3_bucket.site.id}"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  # Single-page game — send any unknown path back to index.html.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.site.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2018"
  }

  depends_on = [aws_acm_certificate_validation.site]
}

# ── Route53: point the subdomain at CloudFront ──────────────────────────────
resource "aws_route53_record" "site_alias" {
  zone_id = data.aws_route53_zone.hosted_zone.zone_id
  name    = var.site_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}
