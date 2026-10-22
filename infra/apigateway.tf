resource "aws_apigatewayv2_api" "api" {
  name          = "${local.name}-api"
  protocol_type = "HTTP"
  description   = "Nearcast hazard API (public, read-only)."

  # CORS is only relevant for local development; production traffic is same-origin via CloudFront.
  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "HEAD", "OPTIONS"]
    allow_headers = ["content-type", "accept"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_alias.live.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 29000
}

locals {
  api_routes = [
    "GET /api/health",
    "GET /api/awareness",
    "GET /api/places/search",
    "GET /api/forecast",
    "GET /api/gauges",
    "GET /api/hazards",
    "GET /api/hazards/summary",
    "GET /api/hazards/{id}",
  ]
}

resource "aws_apigatewayv2_route" "routes" {
  for_each  = toset(local.api_routes)
  api_id    = aws_apigatewayv2_api.api.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  depends_on  = [aws_apigatewayv2_route.routes]
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 200
    throttling_rate_limit  = 100
  }
  dynamic "route_settings" {
    for_each = toset(["GET /api/places/search", "GET /api/forecast", "GET /api/gauges"])
    content {
      route_key              = route_settings.value
      throttling_burst_limit = 5
      throttling_rate_limit  = 2
    }
  }
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  qualifier     = aws_lambda_alias.live.name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
