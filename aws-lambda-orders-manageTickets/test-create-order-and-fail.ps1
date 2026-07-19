# Script completo para probar el flujo: Crear orden → Simular pago fallido → Verificar liberación
# ================================================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$EventId = "ba42aa8b-6e7b-4eb9-937e-260f7968288b",
    
    [Parameter(Mandatory=$false)]
    [string]$UserId = "test-user-123",
    
    [Parameter(Mandatory=$false)]
    [string]$DistributionId = "ac30d525-9353-4d75-bc3c-ca4cee87cab3"
)

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "🧪 PRUEBA COMPLETA: Orden → Pago Fallido → Liberación" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

# Paso 1: Obtener boletas disponibles
Write-Host "`n📊 PASO 1: Consultando boletas disponibles..." -ForegroundColor Yellow
$availableUrl = "https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/events/$EventId/available-seats"
$available = Invoke-RestMethod -Uri $availableUrl -Method GET

$category = $available.categories[0]
Write-Host "Categoría: $($category.categoryName)" -ForegroundColor Gray
Write-Host "Disponibles antes: $($category.summary.availableSeats)" -ForegroundColor Gray

# Tomar 2 boletas para la prueba
$ticketsToReserve = $category.seats | Where-Object { $_.ticketStatus -eq 'AVAILABLE' } | Select-Object -First 2

if ($ticketsToReserve.Count -lt 2) {
    Write-Host "❌ No hay suficientes boletas disponibles" -ForegroundColor Red
    exit 1
}

Write-Host "Boletas seleccionadas:" -ForegroundColor Gray
$ticketsToReserve | ForEach-Object { 
    Write-Host "  - $($_.ticketInstanceId)" -ForegroundColor DarkGray 
}

# Paso 2: Crear orden
Write-Host "`n📝 PASO 2: Creando orden..." -ForegroundColor Yellow
$createOrderUrl = "https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders"
$orderPayload = @{
    eventId = $EventId
    userId = $UserId
    tickets = @($ticketsToReserve | ForEach-Object {
        @{
            ticketInstanceId = $_.ticketInstanceId
            distributionId = $DistributionId
            createDate = $category.createDate
            category = $category.categoryName
            price = [decimal]$_.price
        }
    })
    metadata = @{
        test = $true
        timestamp = (Get-Date).ToString("o")
    }
} | ConvertTo-Json -Depth 10

Write-Host "`nPayload:" -ForegroundColor Gray
Write-Host $orderPayload -ForegroundColor DarkGray

try {
    $orderResponse = Invoke-RestMethod -Uri $createOrderUrl -Method POST -Body $orderPayload -ContentType "application/json"
    $orderId = $orderResponse.order_id

    Write-Host "✅ Orden creada: $orderId" -ForegroundColor Green
    Write-Host "Boletas reservadas: $($orderResponse.tickets.Count)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Error al crear orden:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow
    }
    exit 1
}

# Esperar 2 segundos
Write-Host "`n⏳ Esperando 2 segundos..." -ForegroundColor Gray
Start-Sleep -Seconds 2

# Paso 3: Verificar que las boletas están en RESERVED
Write-Host "`n🔍 PASO 3: Verificando estado RESERVED..." -ForegroundColor Yellow
$available2 = Invoke-RestMethod -Uri $availableUrl -Method GET
$category2 = $available2.categories | Where-Object { $_.categoryName -eq $category.categoryName }

Write-Host "Disponibles después de reservar: $($category2.summary.availableSeats)" -ForegroundColor $(if($category2.summary.availableSeats -eq ($category.summary.availableSeats - 2)){"Green"}else{"Red"})
Write-Host "Reservadas: $($category2.summary.reservedSeats)" -ForegroundColor Gray
- PRUEBA
# Paso 4: Simular pago fallido
Write-Host "`n❌ PASO 4: Simulando pago FALLIDO..." -ForegroundColor Yellow
$callbackUrl = "https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/payments/callback"
$callbackPayload = @{
    reference = $orderId
    status = "REJECTED"
    payment_data = @{
        error_code = "insufficient_funds"
        error_message = "Fondos insuficientes (PRUEBA)"
    }
} | ConvertTo-Json

$callbackResponse = Invoke-RestMethod -Uri $callbackUrl -Method POST -Body $callbackPayload -ContentType "application/json"

Write-Host "✅ Callback procesado" -ForegroundColor Green
Write-Host "Status: $($callbackResponse.status)" -ForegroundColor Gray
Write-Host "Boletas liberadas: $($callbackResponse.tickets_released)" -ForegroundColor $(if($callbackResponse.tickets_released -gt 0){"Green"}else{"Red"})

# Paso 5: Verificar que las boletas volvieron a AVAILABLE
Write-Host "`n🔍 PASO 5: Verificando liberación de boletas..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
$available3 = Invoke-RestMethod -Uri $availableUrl -Method GET
$category3 = $available3.categories | Where-Object { $_.categoryName -eq $category.categoryName }

Write-Host "Disponibles después de liberar: $($category3.summary.availableSeats)" -ForegroundColor $(if($category3.summary.availableSeats -eq $category.summary.availableSeats){"Green"}else{"Red"})
Write-Host "Reservadas: $($category3.summary.reservedSeats)" -ForegroundColor Gray

# Resumen final
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "📊 RESUMEN FINAL" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "Orden creada: $orderId" -ForegroundColor White
Write-Host "Boletas iniciales: $($category.summary.availableSeats)" -ForegroundColor White
Write-Host "Boletas después de reservar: $($category2.summary.availableSeats)" -ForegroundColor White
Write-Host "Boletas después de liberar: $($category3.summary.availableSeats)" -ForegroundColor White
Write-Host ""

$exito = $category3.summary.availableSeats -eq $category.summary.availableSeats
if ($exito) {
    Write-Host "✅ PRUEBA EXITOSA: Las boletas se liberaron correctamente" -ForegroundColor Green
} else {
    Write-Host "❌ PRUEBA FALLIDA: Las boletas NO se liberaron" -ForegroundColor Red
    Write-Host "Diferencia: $(($category.summary.availableSeats - $category3.summary.availableSeats)) boletas" -ForegroundColor Red
}
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
