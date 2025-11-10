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
