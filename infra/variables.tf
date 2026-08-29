variable "aws_region" {
  description = "Primary AWS region (S3 bucket, CloudFront is global)"
  type        = string
  default     = "ap-southeast-2"
}

variable "site_domain" {
  description = "Public hostname the game is served from"
  type        = string
  default     = "cokco.theclouddevopslearningblog.com"
}

variable "hosted_zone_name" {
  description = "Existing Route53 public hosted zone to add the subdomain record to"
  type        = string
  default     = "theclouddevopslearningblog.com"
}

variable "project" {
  description = "Short slug used for tags and resource comments"
  type        = string
  default     = "cokco"
}
