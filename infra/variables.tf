variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "AWS region to deploy the PricePulse stack."
}

variable "environment" {
  type        = string
  default     = "dev"
  description = "Environment name suffix used to namespace resources."
}

variable "enable_sms_notifications" {
  type        = bool
  default     = false
  description = "Whether to create the SNS SMS subscription resources."
}

variable "allowed_cors_origins" {
  type        = list(string)
  default     = ["*"]
  description = "List of origins allowed to access the API Gateway endpoint."
}

variable "frontend_bucket_name" {
  type        = string
  default     = ""
  description = "Optional override for the S3 bucket that hosts the frontend. Leave empty to generate a unique name."
}

variable "cloudfront_alternate_domain_names" {
  type        = list(string)
  default     = []
  description = "List of custom domain names served by the CloudFront distribution."
}

variable "acm_certificate_arn" {
  type        = string
  default     = ""
  description = "ACM certificate ARN used when providing alternate domain names for CloudFront."
}
