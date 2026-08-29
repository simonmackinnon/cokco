terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Partial S3 backend — the bucket name is passed via -backend-config, from the
  # TF_STATE_BUCKET GitHub secret in CI or a local flag.
  # Run scripts/bootstrap-state-bucket.sh once before the first `terraform init`.
  backend "s3" {
    key     = "cokco/terraform.tfstate"
    region  = "ap-southeast-2"
    encrypt = true
  }
}
