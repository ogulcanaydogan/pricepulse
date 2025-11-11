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

variable "domain_name" {
  type        = string
  default     = "price.ogulcanaydogan.com"
  description = "Domain name for the frontend (e.g., price.ogulcanaydogan.com)"
}

variable "root_domain_name" {
  type        = string
  default     = "ogulcanaydogan.com"
  description = "Root domain name for Route53 zone lookup (e.g., ogulcanaydogan.com)"
}

variable "acm_certificate_arn" {
  type        = string
  description = "ARN of the ACM certificate for HTTPS. Must be in us-east-1 region for CloudFront."
  default     = ""
}

variable "auto_confirm_signup" {
  type        = bool
  default     = true
  description = "Whether the auth Lambda should automatically confirm new Cognito signups."
}
