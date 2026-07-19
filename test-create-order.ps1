#!/usr/bin/env pwsh
# Script para crear órdenes en DoEvents API
# Uso: ./test-create-order.ps1

param(
    [string]$EventId = "1392904a-2554-4131-8cd8-a9314c46dc5a",
    [string]$UserId = "cedef71c-c",
    [string]$ApiEndpoint = "https://ysfmaeawlf.execute-api.us-east-1.amazonaws.com/dev",
    [int]$TicketCount = 3,
    [int]$PricePerTicket = 33333
)

Write-Host "🎫 DoEvents Order Creation Test" -ForegroundColor Cyan
Write-Host "=" * 60

# Validar parámetros
if (-not $EventId) {
    Write-Host "❌ eventId es requerido" -ForegroundColor Red
    exit 1
}

if (-not $UserId) {
    Write-Host "❌ userId es requerido" -ForegroundColor Red
    exit 1
}

# Generar tickets
Write-Host "`n📝 Generando $TicketCount tickets..." -ForegroundColor Yellow
$tickets = @()
for ($i = 1; $i -le $TicketCount; $i++) {
    $ticketId = [guid]::NewGuid().ToString()
    $tickets += @{
        ticket_id = $ticketId
        ticketsDistId = "dist-" + [guid]::NewGuid().ToString().Substring(0, 8)
        purchasePrice = $PricePerTicket
        category = "GENERAL"
    }
    Write-Host "  ✓ Ticket $i: $ticketId (Precio: $PricePerTicket)" -ForegroundColor Gray
}

# Calcular totales
$totalTicketAmount = $TicketCount * $PricePerTicket
$totalAdditionalCharges = 0
$totalAmount = $totalTicketAmount + $totalAdditionalCharges

Write-Host "`n💰 Totales calculados:" -ForegroundColor Yellow
Write-Host "  - Precio unitario: $PricePerTicket COP" -ForegroundColor Gray
Write-Host "  - Cantidad tickets: $TicketCount" -ForegroundColor Gray
Write-Host "  - Total tickets: $totalTicketAmount COP" -ForegroundColor Gray
Write-Host "  - Cargos adicionales: $totalAdditionalCharges COP" -ForegroundColor Gray
Write-Host "  - TOTAL: $totalAmount COP" -ForegroundColor Green

# Construir payload
$payload = @{
    event_id = $EventId
    user_id = $UserId
    currency = "COP"
    payment_status = "PENDING"
    reference = "test_orden_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    customer_email = "jlyaleoficial@gmail.com"
    amount = $totalAmount
    tickets = $tickets
    metadata = @{
        eventName = "Test Orden - DoEvents"
        hasSeating = $false
        orderTotals = @{
            total_ticket_amount = $totalTicketAmount
            total_additional_charges = $totalAdditionalCharges
            total_amount = $totalAmount
        }
    }
} | ConvertTo-Json -Depth 10

Write-Host "`n📤 Enviando orden a: $ApiEndpoint/orders" -ForegroundColor Cyan

# Guardar payload para debug
$payload | Out-File -FilePath "payload_debug.json" -Encoding UTF8
Write-Host "  💾 Payload guardado en: payload_debug.json" -ForegroundColor Gray

# Enviar request
try {
    Write-Host "`n⏳ Esperando respuesta..." -ForegroundColor Yellow
    
    $response = Invoke-WebRequest `
        -Uri "$ApiEndpoint/orders" `
        -Method POST `
        -ContentType "application/json" `
        -Body $payload `
        -ErrorAction Stop

    Write-Host "`n✅ Respuesta HTTP: " -ForegroundColor Green -NoNewline
    Write-Host $response.StatusCode -ForegroundColor Green

    $responseBody = $response.Content | ConvertFrom-Json
    
    Write-Host "`n📊 Resultado:" -ForegroundColor Cyan
    Write-Host ($responseBody | ConvertTo-Json -Depth 10) -ForegroundColor Green
    
    # Guardar respuesta
    $responseBody | ConvertTo-Json | Out-File -FilePath "response_success.json" -Encoding UTF8
    Write-Host "`n  💾 Respuesta guardada en: response_success.json" -ForegroundColor Gray

} catch {
    Write-Host "`n❌ Error en la solicitud" -ForegroundColor Red
    Write-Host "Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    
    try {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "`n📋 Detalles del error:" -ForegroundColor Red
        Write-Host ($errorBody | ConvertTo-Json -Depth 10) -ForegroundColor Yellow
        
        # Guardar error
        $errorBody | ConvertTo-Json | Out-File -FilePath "response_error.json" -Encoding UTF8
        Write-Host "`n  💾 Error guardado en: response_error.json" -ForegroundColor Gray
    } catch {
        Write-Host $_.Exception.Message -ForegroundColor Red
    }
    
    exit 1
}

Write-Host "`n" + "=" * 60
Write-Host "✅ Test completado" -ForegroundColor Green
