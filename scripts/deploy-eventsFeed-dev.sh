#!/usr/bin/env bash
# Deploy aws-lambda-eventsFeed a DEV (sa-east-1). Requerido tras cambios CORS/geo (issue #10).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/aws-lambda-eventsFeed"

if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI no instalado." >&2
  exit 1
fi

echo "=== npm ci (eventsFeed) ==="
npm ci --omit=dev 2>/dev/null || npm install --omit=dev

echo "=== serverless deploy DEV (sa-east-1) ==="
npx serverless deploy --config serverless.dev.yml --stage dev --region sa-east-1

echo "=== Smoke eventos cercanos ==="
cd "$ROOT"
node scripts/smoke-discover-nearby-events.mjs

echo "=== Deploy eventsFeed DEV OK ==="
