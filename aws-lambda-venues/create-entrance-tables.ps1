# Script para crear tablas de Entradas (Tickets) para Venues
# Ejecutar en PowerShell

Write-Host "Creando tablas de Entradas para Venues..." -ForegroundColor Green

# Tabla principal: Venue_Entrance (Configuración de entradas de un venue)
Write-Host "`nCreando tabla Venue_Entrance..." -ForegroundColor Yellow
aws dynamodb create-table `
  --table-name Venue_Entrance `
  --attribute-definitions `
    AttributeName=entranceId,AttributeType=S `
    AttributeName=venueId,AttributeType=S `
  --key-schema `
    AttributeName=entranceId,KeyType=HASH `
  --global-secondary-indexes `
    "[{
      `"IndexName`": `"venueIdIndex`",
      `"KeySchema`": [{`"AttributeName`": `"venueId`", `"KeyType`": `"HASH`"}],
      `"Projection`": {`"ProjectionType`": `"ALL`"},
      `"ProvisionedThroughput`": {`"ReadCapacityUnits`": 5, `"WriteCapacityUnits`": 5}
    }]" `
  --provisioned-throughput `
    ReadCapacityUnits=5,WriteCapacityUnits=5 `
  --region us-east-1

Write-Host "Tabla Venue_Entrance creada exitosamente" -ForegroundColor Green

# Tabla: Venue_Entrance_Category (Categorías de entradas por venue)
Write-Host "`nCreando tabla Venue_Entrance_Category..." -ForegroundColor Yellow
aws dynamodb create-table `
  --table-name Venue_Entrance_Category `
  --attribute-definitions `
    AttributeName=entranceCategoryId,AttributeType=S `
    AttributeName=venueId,AttributeType=S `
    AttributeName=entranceId,AttributeType=S `
  --key-schema `
    AttributeName=entranceCategoryId,KeyType=HASH `
  --global-secondary-indexes `
    "[{
      `"IndexName`": `"venueIdIndex`",
      `"KeySchema`": [{`"AttributeName`": `"venueId`", `"KeyType`": `"HASH`"}],
      `"Projection`": {`"ProjectionType`": `"ALL`"},
      `"ProvisionedThroughput`": {`"ReadCapacityUnits`": 5, `"WriteCapacityUnits`": 5}
    },
    {
      `"IndexName`": `"entranceIdIndex`",
      `"KeySchema`": [{`"AttributeName`": `"entranceId`", `"KeyType`": `"HASH`"}],
      `"Projection`": {`"ProjectionType`": `"ALL`"},
      `"ProvisionedThroughput`": {`"ReadCapacityUnits`": 5, `"WriteCapacityUnits`": 5}
    }]" `
  --provisioned-throughput `
    ReadCapacityUnits=5,WriteCapacityUnits=5 `
  --region us-east-1

Write-Host "Tabla Venue_Entrance_Category creada exitosamente" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TABLAS CREADAS EXITOSAMENTE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`nTablas creadas:" -ForegroundColor White
Write-Host "  1. Venue_Entrance (Accesos/Puertas)" -ForegroundColor Yellow
Write-Host "  2. Venue_Entrance_Category (Categorías de acceso)" -ForegroundColor Yellow
Write-Host "`nPuedes verificar las tablas con:" -ForegroundColor White
Write-Host "  aws dynamodb list-tables --region us-east-1" -ForegroundColor Cyan
