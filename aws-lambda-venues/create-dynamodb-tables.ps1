# Script para crear las tablas DynamoDB para el sistema de Venues
# Asegurate de tener AWS CLI instalado y configurado

$Region = "us-east-1"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Creando Tablas DynamoDB para Venues" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Tabla 1: Venues
Write-Host "Creando tabla 'Venues'..." -ForegroundColor Yellow
try {
    aws dynamodb create-table `
        --table-name Venues `
        --attribute-definitions `
            AttributeName=venueId,AttributeType=S `
            AttributeName=ownerUserId,AttributeType=S `
        --key-schema AttributeName=venueId,KeyType=HASH `
        --global-secondary-indexes `
            "[{`"IndexName`":`"ownerUserIdIndex`",`"KeySchema`":[{`"AttributeName`":`"ownerUserId`",`"KeyType`":`"HASH`"}],`"Projection`":{`"ProjectionType`":`"ALL`"},`"ProvisionedThroughput`":{`"ReadCapacityUnits`":5,`"WriteCapacityUnits`":5}}]" `
        --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 `
        --region $Region
    Write-Host "Tabla 'Venues' creada exitosamente" -ForegroundColor Green
} catch {
    Write-Host "Error al crear tabla 'Venues' (puede que ya exista)" -ForegroundColor Yellow
}
Write-Host ""

# Tabla 2: Venue_Floor
Write-Host "Creando tabla 'Venue_Floor'..." -ForegroundColor Yellow
try {
    aws dynamodb create-table `
        --table-name Venue_Floor `
        --attribute-definitions `
            AttributeName=floorId,AttributeType=S `
            AttributeName=venueId,AttributeType=S `
        --key-schema AttributeName=floorId,KeyType=HASH `
        --global-secondary-indexes `
            "[{`"IndexName`":`"venueIdIndex`",`"KeySchema`":[{`"AttributeName`":`"venueId`",`"KeyType`":`"HASH`"}],`"Projection`":{`"ProjectionType`":`"ALL`"},`"ProvisionedThroughput`":{`"ReadCapacityUnits`":5,`"WriteCapacityUnits`":5}}]" `
        --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 `
        --region $Region
    Write-Host "Tabla 'Venue_Floor' creada exitosamente" -ForegroundColor Green
} catch {
    Write-Host "Error al crear tabla 'Venue_Floor' (puede que ya exista)" -ForegroundColor Yellow
}
Write-Host ""

# Tabla 3: Venue_Element
Write-Host "Creando tabla 'Venue_Element'..." -ForegroundColor Yellow
try {
    aws dynamodb create-table `
        --table-name Venue_Element `
        --attribute-definitions `
            AttributeName=elementId,AttributeType=S `
            AttributeName=floorId,AttributeType=S `
        --key-schema AttributeName=elementId,KeyType=HASH `
        --global-secondary-indexes `
            "[{`"IndexName`":`"floorIdIndex`",`"KeySchema`":[{`"AttributeName`":`"floorId`",`"KeyType`":`"HASH`"}],`"Projection`":{`"ProjectionType`":`"ALL`"},`"ProvisionedThroughput`":{`"ReadCapacityUnits`":5,`"WriteCapacityUnits`":5}}]" `
        --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 `
        --region $Region
    Write-Host "Tabla 'Venue_Element' creada exitosamente" -ForegroundColor Green
} catch {
    Write-Host "Error al crear tabla 'Venue_Element' (puede que ya exista)" -ForegroundColor Yellow
}
Write-Host ""

# Tabla 4: Venue_Category
Write-Host "Creando tabla 'Venue_Category'..." -ForegroundColor Yellow
try {
    aws dynamodb create-table `
        --table-name Venue_Category `
        --attribute-definitions `
            AttributeName=categoryId,AttributeType=S `
            AttributeName=floorId,AttributeType=S `
        --key-schema AttributeName=categoryId,KeyType=HASH `
        --global-secondary-indexes `
            "[{`"IndexName`":`"floorIdIndex`",`"KeySchema`":[{`"AttributeName`":`"floorId`",`"KeyType`":`"HASH`"}],`"Projection`":{`"ProjectionType`":`"ALL`"},`"ProvisionedThroughput`":{`"ReadCapacityUnits`":5,`"WriteCapacityUnits`":5}}]" `
        --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 `
        --region $Region
    Write-Host "Tabla 'Venue_Category' creada exitosamente" -ForegroundColor Green
} catch {
    Write-Host "Error al crear tabla 'Venue_Category' (puede que ya exista)" -ForegroundColor Yellow
}
Write-Host ""

# Tabla 5: Venue_Seat
Write-Host "Creando tabla 'Venue_Seat'..." -ForegroundColor Yellow
try {
    aws dynamodb create-table `
        --table-name Venue_Seat `
        --attribute-definitions `
            AttributeName=seatId,AttributeType=S `
            AttributeName=categoryId,AttributeType=S `
        --key-schema AttributeName=seatId,KeyType=HASH `
        --global-secondary-indexes `
            "[{`"IndexName`":`"categoryIdIndex`",`"KeySchema`":[{`"AttributeName`":`"categoryId`",`"KeyType`":`"HASH`"}],`"Projection`":{`"ProjectionType`":`"ALL`"},`"ProvisionedThroughput`":{`"ReadCapacityUnits`":5,`"WriteCapacityUnits`":5}}]" `
        --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 `
        --region $Region
    Write-Host "Tabla 'Venue_Seat' creada exitosamente" -ForegroundColor Green
} catch {
    Write-Host "Error al crear tabla 'Venue_Seat' (puede que ya exista)" -ForegroundColor Yellow
}
Write-Host ""

# Verificacion
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Verificando tablas creadas..." -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

$tables = @("Venues", "Venue_Floor", "Venue_Element", "Venue_Category", "Venue_Seat")

foreach ($table in $tables) {
    Write-Host "Verificando tabla '$table'..." -ForegroundColor Yellow
    try {
        $status = aws dynamodb describe-table --table-name $table --region $Region --query "Table.TableStatus" --output text 2>&1
        if ($status -eq "ACTIVE") {
            Write-Host "  Estado: ACTIVE" -ForegroundColor Green
        } elseif ($status -eq "CREATING") {
            Write-Host "  Estado: CREATING (espera unos segundos)" -ForegroundColor Yellow
        } else {
            Write-Host "  Estado: $status" -ForegroundColor Cyan
        }
    } catch {
        Write-Host "  No se pudo verificar (puede estar creandose)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Proceso completado!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Nota: Las tablas pueden tardar unos segundos en estar ACTIVE" -ForegroundColor Yellow
Write-Host "Puedes verificar el estado con:" -ForegroundColor Yellow
Write-Host "  aws dynamodb list-tables --region us-east-1" -ForegroundColor Cyan
Write-Host ""
Write-Host "Presiona cualquier tecla para continuar..."
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
