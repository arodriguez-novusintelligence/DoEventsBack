# Script para probar liberación de boletas cuando el pago falla
# ================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$OrderId,
    
    [Parameter(Mandatory=$false)]
    [string]$Status = "REJECTED"
)

$endpoint = "https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/payments/callback"

$payload = @{
    reference = $OrderId
    status = $Status
    payment_data = @{
        transaction_id = "test_" + (Get-Random)
        timestamp = (Get-Date).ToString("o")
    }
    payment_method = @{
        type = "credit_card"
        last_four = "1234"
    }
} | ConvertTo-Json

Write-Host "`n🧪 Probando callback de pago fallido..." -ForegroundColor Cyan
Write-Host "OrderId: $OrderId" -ForegroundColor Yellow
Write-Host "Status: $Status" -ForegroundColor Yellow
Write-Host "`nPayload:" -ForegroundColor Gray
Write-Host $payload -ForegroundColor DarkGray

$response = Invoke-RestMethod -Uri $endpoint -Method POST -Body $payload -ContentType "application/json"

Write-Host "`n✅ Respuesta recibida:" -ForegroundColor Green
$response | ConvertTo-Json -Depth 10

if ($response.tickets_released) {
    Write-Host "`n🎫 Boletas liberadas: $($response.tickets_released)" -ForegroundColor Green
} else {
    Write-Host "`n⚠️ No se reportaron boletas liberadas" -ForegroundColor Yellow
}

# Verificar estado en DynamoDB
Write-Host "`n🔍 Verificando estado de la orden en DynamoDB..." -ForegroundColor Cyan
$orderCheck = aws dynamodb get-item --table-name Orders --key "{`"order_id`":{`"S`":`"$OrderId`"}}" --output json | ConvertFrom-Json

if ($orderCheck.Item) {
    $paymentStatus = $orderCheck.Item.payment_status.S
    Write-Host "Estado de pago: $paymentStatus" -ForegroundColor $(if($paymentStatus -eq $Status){"Green"}else{"Red"})
    Write-Host "Finalizada: $($orderCheck.Item.finalized_at.S)" -ForegroundColor Gray
} else {
    Write-Host "❌ Orden no encontrada" -ForegroundColor Red
}
