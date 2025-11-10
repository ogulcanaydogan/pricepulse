# SSL Certificate Setup for price.ogulcanaydogan.com

## Prerequisites
- AWS Account with Route53 hosting `ogulcanaydogan.com` zone
- AWS CLI configured with appropriate credentials
- Domain name: `price.ogulcanaydogan.com`

## Step 1: Request ACM Certificate (in us-east-1)

**Important:** CloudFront requires the certificate to be in the `us-east-1` region.

```bash
# Switch to us-east-1 region
export AWS_DEFAULT_REGION=us-east-1

# Request certificate
aws acm request-certificate \
  --domain-name price.ogulcanaydogan.com \
  --validation-method DNS \
  --subject-alternative-names "price.ogulcanaydogan.com" \
  --tags Key=Application,Value=PricePulse

# Get the certificate ARN (will be in pending validation state)
CERT_ARN=$(aws acm list-certificates \
  --query 'CertificateSummaryList[?DomainName==`price.ogulcanaydogan.com`].CertificateArn' \
  --output text)

echo "Certificate ARN: $CERT_ARN"
```

## Step 2: Get DNS Validation Records

```bash
# Get the DNS validation record details
aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

This will output something like:
```json
{
    "Name": "_abc123.price.ogulcanaydogan.com.",
    "Type": "CNAME",
    "Value": "_xyz456.acm-validations.aws."
}
```

## Step 3: Add DNS Validation Record to Route53

You have two options:

### Option A: Manual (AWS Console)
1. Go to Route53 console
2. Select your `ogulcanaydogan.com` hosted zone
3. Create a new CNAME record with the Name and Value from Step 2

### Option B: Automated (AWS CLI)

```bash
# Get the hosted zone ID
ZONE_ID=$(aws route53 list-hosted-zones-by-name \
  --dns-name ogulcanaydogan.com \
  --query 'HostedZones[0].Id' \
  --output text | cut -d'/' -f3)

# Get validation record details
VALIDATION_NAME=$(aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord.Name' \
  --output text)

VALIDATION_VALUE=$(aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord.Value' \
  --output text)

# Create the validation record
aws route53 change-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "'"$VALIDATION_NAME"'",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "'"$VALIDATION_VALUE"'"}]
      }
    }]
  }'
```

## Step 4: Wait for Certificate Validation

```bash
# Check certificate status (wait until it shows ISSUED)
aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --query 'Certificate.Status' \
  --output text

# Or wait automatically
aws acm wait certificate-validated \
  --certificate-arn $CERT_ARN

echo "✅ Certificate validated!"
```

This usually takes 5-30 minutes.

## Step 5: Update Terraform Configuration

Once the certificate is issued, update your `terraform.tfvars` file:

```bash
cd infra

# Create or update terraform.tfvars
cat > terraform.tfvars <<EOF
acm_certificate_arn = "$CERT_ARN"
domain_name         = "price.ogulcanaydogan.com"
root_domain_name    = "ogulcanaydogan.com"
EOF
```

## Step 6: Apply Terraform Configuration

```bash
cd infra
terraform init
terraform plan
terraform apply
```

This will create:
- S3 bucket: `price.ogulcanaydogan.com`
- CloudFront distribution with SSL
- Route53 A and AAAA records pointing to CloudFront

## Step 7: Deploy Frontend

```bash
cd infra
./deploy-frontend.sh
```

## Verification

After deployment (wait 5-10 minutes for CloudFront propagation):

```bash
# Check DNS resolution
dig price.ogulcanaydogan.com

# Test HTTPS
curl -I https://price.ogulcanaydogan.com

# Open in browser
open https://price.ogulcanaydogan.com
```

## Troubleshooting

### Certificate stuck in "Pending Validation"
- Verify the CNAME record was created correctly in Route53
- Check that there are no conflicting records
- DNS propagation can take up to 30 minutes

### CloudFront returns 403 Forbidden
- Check S3 bucket policy allows CloudFront OAC
- Verify files were uploaded to S3
- Check CloudFront distribution status is "Deployed"

### Website shows old content
- Clear CloudFront cache: `./deploy-frontend.sh` does this automatically
- Hard refresh browser: Cmd+Shift+R (Mac) or Ctrl+F5 (Windows)

## Quick Reference Commands

```bash
# Get certificate ARN
aws acm list-certificates --region us-east-1

# Check certificate status
aws acm describe-certificate --certificate-arn <ARN> --region us-east-1

# Invalidate CloudFront cache
CLOUDFRONT_ID=$(cd infra && terraform output -raw cloudfront_distribution_id)
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths "/*"

# Sync files to S3
S3_BUCKET=$(cd infra && terraform output -raw s3_bucket_name)
aws s3 sync frontend/ s3://$S3_BUCKET/ --delete
```
