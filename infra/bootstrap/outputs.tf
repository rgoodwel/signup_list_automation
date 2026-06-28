output "state_bucket_name" {
  description = "S3 bucket name for Terraform remote state."
  value       = aws_s3_bucket.tf_state.bucket
}

output "lock_table_name" {
  description = "DynamoDB table name for Terraform state locking."
  value       = aws_dynamodb_table.tf_lock.name
}

output "github_oidc_provider_arn" {
  description = "ARN of the GitHub OIDC provider."
  value       = aws_iam_openid_connect_provider.github.arn
}

output "github_actions_role_arn" {
  description = "ARN of the IAM role GitHub Actions assumes. Set as GitHub secret AWS_ROLE_ARN."
  value       = aws_iam_role.github_actions.arn
}

output "github_actions_role_name" {
  description = "Name of the IAM role."
  value       = aws_iam_role.github_actions.name
}
