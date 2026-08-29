output "site_url" {
  description = "Public URL of the game"
  value       = "https://${var.site_domain}"
}

output "site_bucket" {
  description = "S3 bucket the deploy job syncs site/ into"
  value       = aws_s3_bucket.site.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID — used for cache invalidation"
  value       = aws_cloudfront_distribution.site.id
}

output "cloudfront_domain_name" {
  description = "CloudFront domain (the Route53 alias target)"
  value       = aws_cloudfront_distribution.site.domain_name
}
