output "api_endpoint" {
  description = "Invoke URL for the HTTP API."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "user_pool_client_id" {
  description = "Cognito Web Client ID"
  value       = aws_cognito_user_pool_client.web.id
}

output "sns_topic_arn" {
  description = "SNS topic ARN used for notifications"
  value       = aws_sns_topic.alerts.arn
}

output "dynamodb_table_name" {
  description = "Name of the DynamoDB table storing price watch items"
  value       = aws_dynamodb_table.items.name
}

output "cloudfront_distribution_id" {
  description = "CloudFront Distribution ID"
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain_name" {
  description = "CloudFront Distribution Domain Name"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "s3_bucket_name" {
  description = "S3 Bucket name for frontend hosting"
  value       = aws_s3_bucket.frontend.id
}

output "website_url" {
  description = "Website URL"
  value       = "https://${var.domain_name}"
}
