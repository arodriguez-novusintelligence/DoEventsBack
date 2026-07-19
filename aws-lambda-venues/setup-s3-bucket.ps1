# Script para configurar el bucket S3 para imagenes de venues
# Asegurate de tener AWS CLI instalado y configurado

$BucketName = "doevent-venue-images"
$Region = "us-east-1"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Configurando Bucket S3 para Venues" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Crear el bucket
Write-Host "Paso 1: Creando bucket '$BucketName'..." -ForegroundColor Yellow
try {
    aws s3api create-bucket --bucket $BucketName --region $Region 2>&1 | Out-Null
    Write-Host "Bucket creado exitosamente" -ForegroundColor Green
} catch {
    Write-Host "El bucket ya existe o hubo un error" -ForegroundColor Yellow
}
Write-Host ""

# Paso 2: Deshabilitar bloqueo de acceso publico
Write-Host "Paso 2: Deshabilitando bloqueo de acceso publico..." -ForegroundColor Yellow
try {
    aws s3api put-public-access-block `
        --bucket $BucketName `
        --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"
    Write-Host "Bloqueo publico deshabilitado" -ForegroundColor Green
} catch {
    Write-Host "Error al deshabilitar bloqueo publico" -ForegroundColor Red
}
Write-Host ""

# Paso 3: Aplicar politica de bucket
Write-Host "Paso 3: Aplicando politica de acceso publico..." -ForegroundColor Yellow
try {
    aws s3api put-bucket-policy --bucket $BucketName --policy file://bucket-policy.json
    Write-Host "Politica aplicada correctamente" -ForegroundColor Green
} catch {
    Write-Host "Error al aplicar politica" -ForegroundColor Red
}
Write-Host ""

# Paso 4: Configurar CORS
Write-Host "Paso 4: Configurando CORS..." -ForegroundColor Yellow
try {
    aws s3api put-bucket-cors --bucket $BucketName --cors-configuration file://cors-config.json
    Write-Host "CORS configurado correctamente" -ForegroundColor Green
} catch {
    Write-Host "Error al configurar CORS" -ForegroundColor Red
}
Write-Host ""

# Paso 5: Habilitar versionado (opcional)
Write-Host "Paso 5: Habilitando versionado..." -ForegroundColor Yellow
try {
    aws s3api put-bucket-versioning --bucket $BucketName --versioning-configuration Status=Enabled
    Write-Host "Versionado habilitado" -ForegroundColor Green
} catch {
    Write-Host "Error al habilitar versionado" -ForegroundColor Red
}
Write-Host ""

# Paso 6: Verificacion
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Verificando configuracion..." -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Verificando que el bucket existe..." -ForegroundColor Yellow
try {
    aws s3api head-bucket --bucket $BucketName 2>&1 | Out-Null
    Write-Host "Bucket existe y es accesible" -ForegroundColor Green
} catch {
    Write-Host "No se puede acceder al bucket" -ForegroundColor Red
}
Write-Host ""

Write-Host "Verificando politica de bucket..." -ForegroundColor Yellow
try {
    $policy = aws s3api get-bucket-policy --bucket $BucketName --query Policy --output text
    Write-Host "Politica configurada:" -ForegroundColor Green
    Write-Host $policy -ForegroundColor Gray
} catch {
    Write-Host "No se pudo obtener la politica" -ForegroundColor Red
}
Write-Host ""

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Configuracion completada!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "URL Base del Bucket:" -ForegroundColor Yellow
Write-Host "https://$BucketName.s3.amazonaws.com/" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ejemplo de URL de imagen:" -ForegroundColor Yellow
Write-Host "https://$BucketName.s3.amazonaws.com/venues/{venueId}/{imageId}.jpg" -ForegroundColor Cyan
Write-Host ""
Write-Host "Presiona cualquier tecla para continuar..."
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
