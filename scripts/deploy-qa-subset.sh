#!/usr/bin/env bash
# Despliegue QA lambdas (invocado desde buildspec-qa.yml)
set -euo pipefail

export AWS_REGION="${AWS_REGION:-us-east-2}"
ROOT="${CODEBUILD_SRC_DIR:-.}"

deploy_lambda() {
  local dir="$1"
  local config="${2:-serverless.yml}"
  echo "=== Deploy ${dir} (${config}) ==="
  cd "${ROOT}/${dir}"
  npm install --omit=dev --silent 2>/dev/null || npm install --silent
  npx serverless deploy --config "${config}" --stage qa --region "${AWS_REGION}" --verbose
}

deploy_lambda aws-lambda-manageevents serverless.yml
deploy_lambda aws-lambda-login serverless.qa.yml
deploy_lambda aws-lambda-managetickets serverless.yml
echo "Deploy QA backend subset completado"
