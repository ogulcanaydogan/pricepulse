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
