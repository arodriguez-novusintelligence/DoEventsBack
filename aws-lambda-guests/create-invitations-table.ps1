# Script para crear la tabla EventInvitations en DynamoDB

Write-Host "Creando tabla EventInvitations..." -ForegroundColor Cyan

aws dynamodb create-table `
  --table-name EventInvitations `
  --attribute-definitions `
    AttributeName=PK,AttributeType=S `
    AttributeName=SK,AttributeType=S `
    AttributeName=userId,AttributeType=S `
    AttributeName=eventId,AttributeType=S `
    AttributeName=createdAt,AttributeType=S `
  --key-schema `
    AttributeName=PK,KeyType=HASH `
    AttributeName=SK,KeyType=RANGE `
  --global-secondary-indexes `
    "IndexName=UserIdIndex,KeySchema=[{AttributeName=userId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL}" `
    "IndexName=EventIdIndex,KeySchema=[{AttributeName=eventId,KeyType=HASH},{AttributeName=createdAt,KeyType=RANGE}],Projection={ProjectionType=ALL}" `
  --billing-mode PAY_PER_REQUEST `
  --region us-east-1

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Tabla EventInvitations creada exitosamente" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Error al crear la tabla EventInvitations" -ForegroundColor Red
}
