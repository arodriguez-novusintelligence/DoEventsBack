# Script para probar TTL de 15 minutos
# ====================================

param(
    [Parameter(Mandatory=$false)]
    [string]$EventId = "ba42aa8b-6e7b-4eb9-937e-260f7968288b",
    
    [Parameter(Mandatory=$false)]
    [string]$UserId = "test-user-ttl",
    
    [Parameter(Mandatory=$false)]
    [string]$DistributionId = "ac30d525-9353-4d75-bc3c-ca4cee87cab3"
)

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "⏱️  PRUEBA TTL: 15 Minutos" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

# Obtener boletas disponibles
Write-Host "`n📊 Consultando boletas disponibles..." -ForegroundColor Yellow
$availableUrl = "https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/events/$EventId/available-seats"
$available = Invoke-RestMethod -Uri $availableUrl -Method GET

$category = $available.categories[0]
$ticketToReserve = $category.seats | Where-Object { $_.ticketStatus -eq 'AVAILABLE' } | Select-Object -First 1

Write-Host "Boleta seleccionada: $($ticketToReserve.ticketInstanceId)" -ForegroundColor Gray

# Crear orden
Write-Host "`n📝 Creando orden..." -ForegroundColor Yellow
$createOrderUrl = "https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders"
$orderPayload = @{
    eventId = $EventId
    userId = $UserId
    tickets = @(@{
        ticketInstanceId = $ticketToReserve.ticketInstanceId
        distributionId = $DistributionId
        createDate = $category.createDate
        category = $category.categoryName
        price = $ticketToReserve.price
    })
} | ConvertTo-Json -Depth 10

$orderResponse = Invoke-RestMethod -Uri $createOrderUrl -Method POST -Body $orderPayload -ContentType "application/json"
$orderId = $orderResponse.order_id

Write-Host "✅ Orden creada: $orderId" -ForegroundColor Green

# Obtener TTL de la orden
$orderData = aws dynamodb get-item --table-name Orders --key "{`"order_id`":{`"S`":`"$orderId`"}}" --output json | ConvertFrom-Json

if ($orderData.Item.order_ttl) {
    $ttl = [long]$orderData.Item.order_ttl.N
    $ttlDate = [DateTimeOffset]::FromUnixTimeSeconds($ttl).LocalDateTime
    $minutosRestantes = [Math]::Round((($ttl * 1000) - [DateTimeOffset]::Now.ToUnixTimeMilliseconds()) / 60000, 1)
    
    Write-Host "`n⏰ TTL configurado:" -ForegroundColor Yellow
    Write-Host "  Unix timestamp: $ttl" -ForegroundColor Gray
    Write-Host "  Fecha/hora: $($ttlDate.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Gray
    Write-Host "  Tiempo restante: $minutosRestantes minutos" -ForegroundColor $(if($minutosRestantes -le 15 -and $minutosRestantes -ge 14){"Green"}else{"Yellow"})
    
    if ($minutosRestantes -lt 14 -or $minutosRestantes -gt 16) {
        Write-Host "`n  ⚠️  ADVERTENCIA: TTL no es 15 minutos exactos" -ForegroundColor Yellow
    } else {
        Write-Host "`n  ✅ TTL correcto: ~15 minutos" -ForegroundColor Green
    }
}

# Verificar EventBridge Scheduler
Write-Host "`n🗓️  Verificando EventBridge Scheduler..." -ForegroundColor Yellow
$scheduleName = "release-order-$orderId"
try {
    $schedule = aws scheduler get-schedule --name $scheduleName --output json 2>$null | ConvertFrom-Json
    if ($schedule) {
        Write-Host "✅ Schedule creado: $scheduleName" -ForegroundColor Green
        Write-Host "  Target: $($schedule.Target.Arn.Split(':')[-1])" -ForegroundColor Gray
        Write-Host "  Schedule: $($schedule.ScheduleExpression)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Schedule no encontrado" -ForegroundColor Red
}

# Mostrar instrucciones de monitoreo
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "📋 INSTRUCCIONES DE MONITOREO" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "1️⃣  Ver logs de liberación (en tiempo real):" -ForegroundColor White
Write-Host "   aws logs tail /aws/lambda/aws-lambda-orders-manageTickets-dev-releaseExpiredOrder --follow --format short" -ForegroundColor Cyan
Write-Host ""
Write-Host "2️⃣  Verificar estado de la orden:" -ForegroundColor White
Write-Host "   aws dynamodb get-item --table-name Orders --key '{`"order_id`":{`"S`":`"$orderId`"}}' --output json | ConvertFrom-Json | Select-Object -ExpandProperty Item | ConvertTo-Json -Depth 5" -ForegroundColor Cyan
Write-Host ""
Write-Host "3️⃣  Verificar liberación manual (después de 15 min):" -ForegroundColor White
Write-Host "   Invoke-RestMethod -Uri 'https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders/$orderId/release' -Method POST" -ForegroundColor Cyan
Write-Host ""
Write-Host "4️⃣  Verificar boletas liberadas:" -ForegroundColor White
Write-Host "   Invoke-RestMethod -Uri '$availableUrl' -Method GET | ConvertTo-Json -Depth 10" -ForegroundColor Cyan
Write-Host ""
Write-Host "⏰ La orden expirará en $minutosRestantes minutos" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
