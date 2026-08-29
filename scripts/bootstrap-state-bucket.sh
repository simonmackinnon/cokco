#!/usr/bin/env bash
# Run ONCE, with admin AWS credentials, to create the S3 bucket that stores
# Terraform state for this project.
#
# Usage:   ./scripts/bootstrap-state-bucket.sh
#          ./scripts/bootstrap-state-bucket.sh my-custom-bucket-name
#
# With no argument it derives a name from your AWS account id:
#   cokco-terraform-state-<account-id>
#
# After running:
#   1. Add the bucket name as the GitHub Actions secret  TF_STATE_BUCKET
#   2. cd infra && terraform init -backend-config="bucket=<name>"

set -euo pipefail

REGION="ap-southeast-2"

if [[ $# -ge 1 ]]; then
  BUCKET="$1"
else
  ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
  BUCKET="cokco-terraform-state-${ACCOUNT_ID}"
fi

echo "Region : $REGION"
echo "Bucket : $BUCKET"
echo ""

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "Bucket already exists — nothing to do."
  exit 0
fi

echo "Creating Terraform state bucket..."
aws s3api create-bucket \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION" >/dev/null

aws s3api put-bucket-versioning \
  --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket "$BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

echo ""
echo "State bucket ready: $BUCKET"
echo ""
echo "Next:"
echo "  1. GitHub → repo Settings → Secrets and variables → Actions:"
echo "       TF_STATE_BUCKET       = $BUCKET"
echo "       AWS_ACCESS_KEY_ID     = <CI user key>"
echo "       AWS_SECRET_ACCESS_KEY = <CI user secret>"
echo "  2. Push to main — the deploy workflow provisions infra, then uploads the site."
