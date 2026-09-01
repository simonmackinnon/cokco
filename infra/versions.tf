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
  # NOTE: the state key stays "cokco/..." (and the state bucket keeps its
  # "cokco-terraform-state-*" name) from before the coco rename, so an apply
  # migrates the live cokco.* resources to coco.* rather than orphaning them.
  backend "s3" {
    key     = "cokco/terraform.tfstate"
    region  = "ap-southeast-2"
    encrypt = true
  }
}
