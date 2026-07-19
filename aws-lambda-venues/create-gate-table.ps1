# Script para crear la tabla Venue_Gate en DynamoDB

Write-Host "Creando tabla Venue_Gate en DynamoDB..." -ForegroundColor Cyan

# Crear tabla Venue_Gate
aws dynamodb create-table `
    --table-name Venue_Gate `
    --attribute-definitions `
        AttributeName=gateId,AttributeType=S `
        AttributeName=venueId,AttributeType=S `
    --key-schema `
        AttributeName=gateId,KeyType=HASH `
    --global-secondary-indexes `
        "IndexName=venueIdIndex,KeySchema=[{AttributeName=venueId,KeyType=HASH}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}" `
    --provisioned-throughput `
        ReadCapacityUnits=5,WriteCapacityUnits=5 `
    --region us-east-1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Tabla Venue_Gate creada exitosamente" -ForegroundColor Green
} else {
    Write-Host "✗ Error al crear tabla Venue_Gate" -ForegroundColor Red
}

Write-Host "`nEsperando a que la tabla esté activa..." -ForegroundColor Yellow
aws dynamodb wait table-exists --table-name Venue_Gate --region us-east-1

Write-Host "✓ Tabla Venue_Gate está activa y lista para usar" -ForegroundColor Green

# Mostrar descripción de la tabla
Write-Host "`nDescripción de la tabla:" -ForegroundColor Cyan
aws dynamodb describe-table --table-name Venue_Gate --region us-east-1 --query "Table.[TableName,TableStatus,ItemCount,TableSizeBytes,GlobalSecondaryIndexes[0].IndexName]" --output table
