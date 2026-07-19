# Test automatico: obtiene boletas disponibles y prueba pago fallido
$eventId = "ba42aa8b-6e7b-4eb9-937e-260f7968288b"
$userId = "test-user-" + (Get-Random -Maximum 9999)

Write-Host ""
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "PRUEBA AUTOMATICA: Orden con pago fallido" -ForegroundColor Cyan
Write-Host "===========================================================" -ForegroundColor Cyan

# Paso 1: Obtener boletas disponibles
Write-Host ""
Write-Host "Paso 1: Obteniendo boletas disponibles..." -ForegroundColor Yellow

$response = Invoke-RestMethod -Uri "https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/events/$eventId/available-seats"
$palco = $response.categories | Where-Object { $_.categoryName -eq "PALCO" }

if (-not $palco) {
    Write-Host "ERROR: No se encontro categoria PALCO" -ForegroundColor Red
    exit 1
}

Write-Host "  Boletas PALCO disponibles: $($palco.summary.availableSeats)/20" -ForegroundColor Gray

$availableTickets = $palco.seats | Where-Object { $_.ticketStatus -eq "AVAILABLE" } | Select-Object -First 2

if ($availableTickets.Count -lt 2) {
    Write-Host "ERROR: No hay suficientes boletas disponibles" -ForegroundColor Red
    exit 1
}

Write-Host "  Boletas seleccionadas:" -ForegroundColor Gray
$availableTickets | ForEach-Object {
    Write-Host "    - $($_.ticketInstanceId) (Seat: $($_.location.seatLabel))" -ForegroundColor DarkGray
}

# Paso 2: Crear orden
Write-Host ""
Write-Host "Paso 2: Creando orden..." -ForegroundColor Yellow

$orderPayload = @{
    eventId = $eventId
    userId = $userId
    tickets = @($availableTickets | ForEach-Object {
        @{
            ticketInstanceId = $_.ticketInstanceId
            distributionId = $palco.distributionId
            createDate = $palco.createDate
            category = $palco.categoryName
            price = 100000
        }
    })
} | ConvertTo-Json -Depth 10

try {
    $orderResponse = Invoke-RestMethod -Uri "https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders" -Method POST -Body $orderPayload -ContentType "application/json"
    
    # Intentar extraer order_id de diferentes estructuras posibles
    $orderId = $null
    if ($orderResponse.order_id) {
        $orderId = $orderResponse.order_id
    } elseif ($orderResponse.createOrder -and $orderResponse.createOrder.order_id) {
        $orderId = $orderResponse.createOrder.order_id
    } elseif ($orderResponse.data -and $orderResponse.data.order_id) {
        $orderId = $orderResponse.data.order_id
    }
    
    if (-not $orderId) {
        Write-Host "  Respuesta completa:" -ForegroundColor Gray
        Write-Host ($orderResponse | ConvertTo-Json -Depth 5) -ForegroundColor DarkGray
        Write-Host "ERROR: No se pudo obtener order_id" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "  OK - Orden creada: $orderId" -ForegroundColor Green
    
    # Paso 3: Verificar estado inicial
    Write-Host ""
    Write-Host "Paso 3: Verificando reserva..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    
    $response2 = Invoke-RestMethod -Uri "https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/events/$eventId/available-seats"
    $palco2 = $response2.categories | Where-Object { $_.categoryName -eq "PALCO" }
    
    Write-Host "  Disponibles antes: $($palco.summary.availableSeats)" -ForegroundColor Gray
    Write-Host "  Disponibles ahora: $($palco2.summary.availableSeats)" -ForegroundColor $(if($palco2.summary.availableSeats -eq ($palco.summary.availableSeats - 2)){"Green"}else{"Yellow"})
    
    # Paso 4: Simular pago RECHAZADO
    Write-Host ""
    Write-Host "Paso 4: Simulando pago RECHAZADO..." -ForegroundColor Yellow
    
    $callbackPayload = @{
        reference = $orderId
        status = "REJECTED"
        payment_data = @{
            error_code = "insufficient_funds"
            error_message = "Fondos insuficientes - TEST"
        }
    } | ConvertTo-Json
    
    $callbackResponse = Invoke-RestMethod -Uri "https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/payments/callback" -Method POST -Body $callbackPayload -ContentType "application/json"
    
    Write-Host "  OK - Callback procesado" -ForegroundColor Green
    
    if ($callbackResponse.processPaymentCallback) {
        $cbData = $callbackResponse.processPaymentCallback
        Write-Host "  Status: $($cbData.status)" -ForegroundColor Gray
        if ($cbData.tickets_released) {
            Write-Host "  Boletas liberadas: $($cbData.tickets_released)" -ForegroundColor Green
        }
    }
    
    # Paso 5: Verificar liberacion
    Write-Host ""
    Write-Host "Paso 5: Verificando liberacion..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    
    $response3 = Invoke-RestMethod -Uri "https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/events/$eventId/available-seats"
    $palco3 = $response3.categories | Where-Object { $_.categoryName -eq "PALCO" }
    
    Write-Host "  Disponibles despues de liberar: $($palco3.summary.availableSeats)" -ForegroundColor $(if($palco3.summary.availableSeats -eq $palco.summary.availableSeats){"Green"}else{"Yellow"})
    
    # Verificar orden en DynamoDB
    $orderCheck = aws dynamodb get-item --table-name Orders --key "{`"order_id`":{`"S`":`"$orderId`"}}" --output json | ConvertFrom-Json
    
    if ($orderCheck.Item) {
        $paymentStatus = $orderCheck.Item.payment_status.S
        Write-Host "  Payment Status en DB: $paymentStatus" -ForegroundColor $(if($paymentStatus -eq "REJECTED"){"Green"}else{"Red"})
    }
    
    # Resumen
    Write-Host ""
    Write-Host "===========================================================" -ForegroundColor Cyan
    $success = ($palco3.summary.availableSeats -eq $palco.summary.availableSeats) -and ($paymentStatus -eq "REJECTED")
    if ($success) {
        Write-Host "PRUEBA EXITOSA: Boletas liberadas correctamente" -ForegroundColor Green
    } else {
        Write-Host "REVISAR: Verificar discrepancias" -ForegroundColor Yellow
    }
    Write-Host "===========================================================" -ForegroundColor Cyan
    
    Write-Host ""
    Write-Host "Orden ID: $orderId" -ForegroundColor White
    Write-Host "Disponibles inicial: $($palco.summary.availableSeats)" -ForegroundColor White
    Write-Host "Disponibles final: $($palco3.summary.availableSeats)" -ForegroundColor White
    
} catch {
    Write-Host ""
    Write-Host "ERROR:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow
    }
    exit 1
}
