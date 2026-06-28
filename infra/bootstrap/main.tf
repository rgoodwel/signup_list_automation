###############################################################################
# Bootstrap: Terraform Remote State Backend
#
# Run ONCE per AWS account before using any env Terraform.
# Creates:
#   - S3 bucket for Terraform state
#   - DynamoDB table for state locking
#   - GitHub OIDC provider + IAM role for GitHub Actions
#
# Usage:
#   cd infra/bootstrap
#   terraform init
#   terraform apply -var-file=bootstrap.tfvars
###############################################################################

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
  # Bootstrap itself uses local state (chicken-and-egg).
  # Commit the resulting .tfstate file or move it manually after creation.
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      ManagedBy   = "terraform-bootstrap"
      Repository  = var.github_repo
    }
  }
}

###############################################################################
# S3 – Terraform remote state bucket
###############################################################################
resource "aws_s3_bucket" "tf_state" {
  bucket = var.state_bucket_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tf_state" {
  bucket                  = aws_s3_bucket.tf_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

###############################################################################
# DynamoDB – Terraform state lock table
###############################################################################
resource "aws_dynamodb_table" "tf_lock" {
  name         = var.lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

###############################################################################
# GitHub OIDC provider
###############################################################################
data "tls_certificate" "github_oidc" {
  url = "https://token.actions.githubusercontent.com/.well-known/openid-configuration"
}

resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  thumbprint_list = [
    data.tls_certificate.github_oidc.certificates[0].sha1_fingerprint
  ]
}

###############################################################################
# IAM role – assumed by GitHub Actions via OIDC
###############################################################################
data "aws_iam_policy_document" "github_actions_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      # Allow any branch/tag in the repo; tighten to specific branches in prod
      values   = ["repo:${var.github_repo}:*"]
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name               = var.github_actions_role_name
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume.json
  max_session_duration = 3600

  tags = {
    Purpose = "github-actions-oidc"
  }
}

###############################################################################
# IAM policy – least-privilege for Terraform + deployment operations
###############################################################################
data "aws_iam_policy_document" "github_actions_policy" {
  # --- S3: Terraform state + app bucket management ---
  statement {
    sid    = "TerraformStateBucket"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
      "s3:GetBucketVersioning",
      "s3:GetEncryptionConfiguration",
      "s3:GetBucketPublicAccessBlock",
    ]
    resources = [
      "arn:aws:s3:::${var.state_bucket_name}",
      "arn:aws:s3:::${var.state_bucket_name}/*",
    ]
  }

  # S3 for app hosting bucket (managed by Terraform per env)
  statement {
    sid    = "AppS3Buckets"
    effect = "Allow"
    actions = [
      "s3:CreateBucket",
      "s3:DeleteBucket",
      "s3:GetBucketPolicy",
      "s3:PutBucketPolicy",
      "s3:DeleteBucketPolicy",
      "s3:GetBucketLocation",
      "s3:GetBucketVersioning",
      "s3:PutBucketVersioning",
      "s3:GetEncryptionConfiguration",
      "s3:PutEncryptionConfiguration",
      "s3:GetBucketPublicAccessBlock",
      "s3:PutBucketPublicAccessBlock",
      "s3:GetBucketTagging",
      "s3:PutBucketTagging",
      "s3:PutBucketOwnershipControls",
      "s3:GetBucketOwnershipControls",
      "s3:PutBucketCORS",
      "s3:GetBucketCORS",
      "s3:GetLifecycleConfiguration",
      "s3:PutLifecycleConfiguration",
      "s3:GetBucketLogging",
      "s3:PutBucketLogging",
      # Object-level for deploy sync
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
      "s3:ListBucketMultipartUploads",
      "s3:AbortMultipartUpload",
      "s3:GetObjectAcl",
      "s3:PutObjectAcl",
    ]
    resources = ["arn:aws:s3:::*"]
  }

  # --- DynamoDB: state locking ---
  statement {
    sid    = "TerraformStateLock"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:DescribeTable",
    ]
    resources = [
      "arn:aws:dynamodb:*:*:table/${var.lock_table_name}",
    ]
  }

  # --- CloudFront ---
  statement {
    sid    = "CloudFront"
    effect = "Allow"
    actions = [
      "cloudfront:CreateDistribution",
      "cloudfront:UpdateDistribution",
      "cloudfront:DeleteDistribution",
      "cloudfront:GetDistribution",
      "cloudfront:GetDistributionConfig",
      "cloudfront:ListDistributions",
      "cloudfront:TagResource",
      "cloudfront:UntagResource",
      "cloudfront:ListTagsForResource",
      "cloudfront:CreateInvalidation",
      "cloudfront:GetInvalidation",
      "cloudfront:ListInvalidations",
      "cloudfront:CreateOriginAccessControl",
      "cloudfront:UpdateOriginAccessControl",
      "cloudfront:DeleteOriginAccessControl",
      "cloudfront:GetOriginAccessControl",
      "cloudfront:ListOriginAccessControls",
      "cloudfront:CreateCloudFrontOriginAccessIdentity",
      "cloudfront:GetCloudFrontOriginAccessIdentity",
      "cloudfront:DeleteCloudFrontOriginAccessIdentity",
      "cloudfront:ListCloudFrontOriginAccessIdentities",
    ]
    resources = ["*"]
  }

  # --- ACM (certificates) – us-east-1 only for CloudFront ---
  statement {
    sid    = "ACM"
    effect = "Allow"
    actions = [
      "acm:RequestCertificate",
      "acm:DescribeCertificate",
      "acm:DeleteCertificate",
      "acm:ListCertificates",
      "acm:ListTagsForCertificate",
      "acm:AddTagsToCertificate",
    ]
    resources = ["*"]
  }

  # --- Route 53 (optional custom domain) ---
  statement {
    sid    = "Route53"
    effect = "Allow"
    actions = [
      "route53:GetHostedZone",
      "route53:ListHostedZones",
      "route53:ListResourceRecordSets",
      "route53:ChangeResourceRecordSets",
      "route53:GetChange",
    ]
    resources = ["*"]
  }

  # --- IAM: manage roles Terraform creates (scoped by path) ---
  statement {
    sid    = "IAMManage"
    effect = "Allow"
    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:GetRole",
      "iam:ListRoles",
      "iam:UpdateRole",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:PutRolePolicy",
      "iam:GetRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:CreatePolicy",
      "iam:DeletePolicy",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:CreatePolicyVersion",
      "iam:DeletePolicyVersion",
      "iam:ListPolicyVersions",
      "iam:TagPolicy",
    ]
    resources = ["*"]
  }

  # --- STS: allow reading caller identity ---
  statement {
    sid     = "STS"
    effect  = "Allow"
    actions = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "github_actions" {
  name        = "${var.github_actions_role_name}-policy"
  description = "Least-privilege policy for GitHub Actions OIDC role (Terraform + deploy)"
  policy      = data.aws_iam_policy_document.github_actions_policy.json
}

resource "aws_iam_role_policy_attachment" "github_actions" {
  role       = aws_iam_role.github_actions.name
  policy_arn = aws_iam_policy.github_actions.arn
}
