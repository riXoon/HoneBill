locals {
  prefix = "/honebill/dev"

  # Real secrets, taken from env.validation.ts. Add only the ones you actually use,
  # because SSM rejects empty values.
  secret_names = toset([
    "DATABASE_URL", # contains your Neon password
    "REDIS_URL",    # only if you use a hosted Redis
    "RELAYER_SECRET_KEY",
    "REGISTRAR_SECRET_KEY",
    "SECRET_SEP10_SIGNING_SEED",
    "SECRET_SEP10_JWT_SECRET",
    "SECRET_SEP24_INTERACTIVE_URL_JWT_SECRET",
    "OTP_VERIFICATION_JWT_SECRET",
    "PHPC_DISTRIBUTOR_SECRET",
    "USDC_DISTRIBUTOR_SECRET",
    "TEXTBEE_API_KEY",
    "TEXTBEE_WEBHOOK_SECRET",
    "SMS_DISPATCH_SECRET",
    "CRON_SECRET",
  ])

  # Not secret (public URLs and settings). Fine to keep in code and in state.
  config = {
    SOROBAN_RPC_URL            = "https://soroban-testnet.stellar.org"
    STELLAR_HORIZON_URL        = "https://horizon-testnet.stellar.org"
    STELLAR_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015"
    NODE_ENV                   = "production"
    PORT                       = "3001"
    QUEUE_ENABLED              = "true"
  }
}

# Secrets: created with a placeholder; real values are set with the AWS CLI
resource "aws_ssm_parameter" "secret" {
  for_each = local.secret_names

  name  = "${local.prefix}/${each.key}"
  type  = "SecureString" # encrypted with the default AWS key
  value = "CHANGE_ME"

  key_id = aws_kms_key.secrets.arn

  lifecycle {
    ignore_changes = [value] # Terraform won't overwrite what you set later
  }
}

# Plain settings
resource "aws_ssm_parameter" "config" {
  for_each = local.config

  name  = "${local.prefix}/${each.key}"
  type  = "String"
  value = each.value
}

# Read-only identity for the backend server (see the Lightsail note below)
resource "aws_iam_user" "backend_secrets_reader" {
  name = "honebill-backend-secrets-reader"
}

resource "aws_iam_user_policy" "backend_secrets_reader" {
  name = "read-honebill-parameters"
  user = aws_iam_user.backend_secrets_reader.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParametersByPath", "ssm:GetParameters", "ssm:GetParameter"]
        Resource = "arn:aws:ssm:ap-southeast-1:*:parameter${local.prefix}/*" # this path only
      },
      {
        Effect    = "Allow"
        Action    = "kms:Decrypt"
        Resource  = "*"
        Condition = { StringEquals = { "kms:ViaService" = "ssm.ap-southeast-1.amazonaws.com" } }
      }
    ]
  })
}