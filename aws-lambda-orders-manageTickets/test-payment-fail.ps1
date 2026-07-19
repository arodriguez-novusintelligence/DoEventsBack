# Test simple: crear orden y simular pago fallido
$eventId = "ba42aa8b-6e7b-4eb9-937e-260f7968288b"
$userId = "test-user-" + (Get-Random -Maximum 9999)

Write-Host ""
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "PRUEBA: Orden con pago fallido" -ForegroundColor Cyan
Write-Host "===========================================================" -ForegroundColor Cyan

# Paso 1: Crear orden directa
Write-Host ""
Write-Host "Creando orden de prueba..." -ForegroundColor Yellow

$orderPayload = @{
    eventId = $eventId
    userId = $userId
    tickets = @(
        @{
            ticketInstanceId = "eff5c2a1-8904-4755-9459-a5c6d72ddb6c"
            distributionId = "f32ca4ac-a9d7-49b7-ab45-4af67c12914f"
            createDate = "2026-01-29T05:48:05.181Z"
            category = "PALCO"
            price = 100000
        },
        @{
            ticketInstanceId = "c0080b62-c5b3-4eaa-ae1f-8669f7b8f5dd"
            distributionId = "f32ca4ac-a9d7-49b7-ab45-4af67c12914f"
            createDate = "2026-01-29T05:48:05.181Z"
            category = "PALCO"
            price = 100000
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $orderResponse = Invoke-RestMethod -Uri "https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders" -Method POST -Body $orderPayload -ContentType "application/json"
    
    Write-Host "Respuesta completa:" -ForegroundColor Gray
    Write-Host ($orderResponse | ConvertTo-Json -Depth 5) -ForegroundColor DarkGray
    
    $orderId = $orderResponse.order_id
    if (-not $orderId -and $orderResponse.createOrder) {
        $orderId = $orderResponse.createOrder.order_id
    }
    if (-not $orderId -and $orderResponse.data) {
        $orderId = $orderResponse.data.order_id
    }
    
    if (-not $orderId) {
        Write-Host "ERROR: No se pudo obtener order_id de la respuesta" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "OK - Orden creada: $orderId" -ForegroundColor Green
    Write-Host "   User: $userId" -ForegroundColor Gray
    if ($orderResponse.tickets) {
        Write-Host "   Boletas: $($orderResponse.tickets.Count)" -ForegroundColor Gray
    } elseif ($orderResponse.createOrder -and $orderResponse.createOrder.tickets) {
        Write-Host "   Boletas: $($orderResponse.createOrder.tickets.Count)" -ForegroundColor Gray
    }
    
    # Paso 2: Esperar 2 segundos
    Write-Host ""
    Write-Host "Esperando 2 segundos..." -ForegroundColor Gray
    Start-Sleep -Seconds 2
    
    # Paso 3: Simular pago RECHAZADO
    Write-Host ""
    Write-Host "Simulando pago RECHAZADO..." -ForegroundColor Yellow
    
    $callbackPayload = @{
        reference = $orderId
        status = "REJECTED"
        payment_data = @{
            error_code = "insufficient_funds"
            error_message = "Fondos insuficientes"
        }
    } | ConvertTo-Json
    
    $callbackResponse = Invoke-RestMethod -Uri "https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/payments/callback" -Method POST -Body $callbackPayload -ContentType "application/json"
    
    Write-Host "OK - Callback procesado" -ForegroundColor Green
    Write-Host "   Status: $($callbackResponse.status)" -ForegroundColor Gray
    
    if ($callbackResponse.tickets_released) {
        Write-Host "   Boletas liberadas: $($callbackResponse.tickets_released)" -ForegroundColor Green
    }
    
    # Paso 4: Verificar estado final
    Write-Host ""
    Write-Host "Verificando estado final..." -ForegroundColor Yellow
    Start-Sleep -Seconds 1
    
    $orderCheck = aws dynamodb get-item --table-name Orders --key "{`"order_id`":{`"S`":`"$orderId`"}}" --output json | ConvertFrom-Json
    
    if ($orderCheck.Item) {
        $paymentStatus = $orderCheck.Item.payment_status.S
        Write-Host "   Payment Status: $paymentStatus" -ForegroundColor $(if($paymentStatus -eq "REJECTED"){"Green"}else{"Red"})
    }
    
    # Paso 5: Verificar boletas disponibles
    $available = Invoke-RestMethod -Uri "https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/events/$eventId/available-seats" -Method GET
    $palco = $available.categories | Where-Object { $_.categoryName -eq "PALCO" }
    
    Write-Host "   Boletas PALCO disponibles: $($palco.summary.availableSeats)/20" -ForegroundColor $(if($palco.summary.availableSeats -eq 20){"Green"}else{"Yellow"})
    
    Write-Host ""
    Write-Host "===========================================================" -ForegroundColor Cyan
    if ($callbackResponse.tickets_released -gt 0 -and $palco.summary.availableSeats -eq 20) {
        Write-Host "PRUEBA EXITOSA: Boletas liberadas correctamente" -ForegroundColor Green
    } else {
        Write-Host "REVISAR: Verificar logs de CloudWatch" -ForegroundColor Yellow
    }
    Write-Host "===========================================================" -ForegroundColor Cyan
    
    Write-Host ""
    Write-Host "Ver logs:" -ForegroundColor White
    Write-Host "aws logs tail /aws/lambda/aws-lambda-orders-manageTickets-dev-processPaymentCallback --since 5m --format short" -ForegroundColor Cyan
    
} catch {
    Write-Host ""
    Write-Host "ERROR:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow
    }
    exit 1
}
