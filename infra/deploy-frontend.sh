#!/bin/bash
set -e

# PricePulse Frontend Deployment Script
# Deploys static files to S3 and invalidates CloudFront cache

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
INFRA_DIR="$PROJECT_ROOT/infra"

echo "🚀 PricePulse Frontend Deployment"
echo "=================================="

# Check if we're in the right directory
if [ ! -d "$FRONTEND_DIR" ]; then
  echo "❌ Error: Frontend directory not found at $FRONTEND_DIR"
  exit 1
fi

# Get outputs from Terraform
cd "$INFRA_DIR"

echo "📦 Getting deployment configuration from Terraform..."
S3_BUCKET=$(terraform output -raw s3_bucket_name 2>/dev/null)
CLOUDFRONT_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null)

if [ -z "$S3_BUCKET" ] || [ -z "$CLOUDFRONT_ID" ]; then
  echo "❌ Error: Could not get Terraform outputs. Make sure you've run 'terraform apply' first."
  exit 1
fi

echo "   S3 Bucket: $S3_BUCKET"
echo "   CloudFront Distribution: $CLOUDFRONT_ID"
echo ""

# Sync files to S3
echo "📤 Uploading files to S3..."
aws s3 sync "$FRONTEND_DIR" "s3://$S3_BUCKET/" \
  --delete \
  --exclude ".DS_Store" \
  --exclude "*.md" \
  --cache-control "public, max-age=31536000" \
  --exclude "*.html" \
  --exclude "*.json"

# Upload HTML files with no-cache
echo "📤 Uploading HTML files with no-cache..."
aws s3 sync "$FRONTEND_DIR" "s3://$S3_BUCKET/" \
  --exclude "*" \
  --include "*.html" \
  --cache-control "no-cache, no-store, must-revalidate"

echo ""
echo "🔄 Invalidating CloudFront cache..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$CLOUDFRONT_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text)

echo "   Invalidation ID: $INVALIDATION_ID"
echo ""

WEBSITE_URL=$(terraform output -raw website_url 2>/dev/null)
echo "✅ Deployment complete!"
echo ""
echo "🌐 Your website is available at:"
echo "   $WEBSITE_URL"
echo ""
echo "⏳ CloudFront cache invalidation is in progress."
echo "   It may take 5-10 minutes for changes to propagate globally."
