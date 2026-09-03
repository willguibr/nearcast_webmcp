data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/dist"
  output_path = "${path.module}/../backend/lambda.zip"
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.name}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name    = "${local.name}-api"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  memory_size      = var.lambda_memory_mb
  timeout          = var.lambda_timeout_seconds
  architectures    = ["arm64"]

  environment {
    variables = {
      APP_ENV                = var.environment
      LOG_LEVEL              = var.log_level
      CACHE_CONTROL_SECONDS  = tostring(var.api_cache_default_ttl)
      SOURCE_TIMEOUT_MS      = "6000"
      SNAPSHOT_CACHE_SECONDS = "45"
      NODE_OPTIONS           = "--enable-source-maps"
    }
  }

  depends_on = [aws_iam_role_policy.lambda_logs, aws_cloudwatch_log_group.api]
}
