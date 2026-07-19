# Script para verificar o crear el índice eventId en la tabla Tickets

Write-Host "🔍 Verificando tabla Tickets..." -ForegroundColor Cyan

# Verificar si la tabla existe y obtener información
$tableInfo = aws dynamodb describe-table --table-name Tickets 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ La tabla Tickets no existe" -ForegroundColor Red
    exit 1
}

$tableData = $tableInfo | ConvertFrom-Json

# Verificar si existe el índice
$hasEventIdIndex = $false
foreach ($gsi in $tableData.Table.GlobalSecondaryIndexes) {
    Write-Host "📋 Índice encontrado: $($gsi.IndexName)" -ForegroundColor Yellow
    if ($gsi.IndexName -eq "eventIdIndex" -or $gsi.IndexName -eq "eventId-index") {
        $hasEventIdIndex = $true
        Write-Host "✅ Índice eventId encontrado: $($gsi.IndexName)" -ForegroundColor Green
        Write-Host "   KeySchema: $($gsi.KeySchema | ConvertTo-Json -Compress)" -ForegroundColor Gray
    }
}

if (-not $hasEventIdIndex) {
    Write-Host "⚠️  No se encontró índice para eventId" -ForegroundColor Yellow
    Write-Host "📝 Para crear el índice, ejecuta:" -ForegroundColor Cyan
    Write-Host "aws dynamodb update-table --table-name Tickets --attribute-definitions AttributeName=eventId,AttributeType=S --global-secondary-index-updates '[{""Create"":{""IndexName"":""eventIdIndex"",""KeySchema"":[{""AttributeName"":""eventId"",""KeyType"":""HASH""}],""Projection"":{""ProjectionType"":""ALL""},""ProvisionedThroughput"":{""ReadCapacityUnits"":5,""WriteCapacityUnits"":5}}}]'" -ForegroundColor White
} else {
    Write-Host "✅ La tabla Tickets está lista para consultas por eventId" -ForegroundColor Green
}
