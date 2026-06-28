variable "aws_region" {
  description = "AWS region for bootstrap resources (state bucket lives here)."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short project identifier used for tagging."
  type        = string
  default     = "golf-league"
}

variable "state_bucket_name" {
  description = "Globally unique S3 bucket name for Terraform state. Must be lowercase, 3-63 chars."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9\\-]{1,61}[a-z0-9]$", var.state_bucket_name))
    error_message = "Bucket name must be lowercase alphanumeric with hyphens, 3-63 chars."
  }
}

variable "lock_table_name" {
  description = "DynamoDB table name for Terraform state locking."
  type        = string
  default     = "golf-league-tf-lock"
}

variable "github_repo" {
  description = "GitHub repo in 'owner/repo' format. Controls OIDC trust."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repo))
    error_message = "github_repo must be 'owner/repo' format."
  }
}

variable "github_actions_role_name" {
  description = "Name for the IAM role assumed by GitHub Actions."
  type        = string
  default     = "golf-league-github-actions"
}
