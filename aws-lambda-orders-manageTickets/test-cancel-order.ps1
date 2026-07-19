param(
    [Parameter(Mandatory=$true)]
    [string]$OrderId
)

$url = "https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders/cancel"

$body = @{
    orderID = $OrderId
} | ConvertTo-Json

Write-Host "🔄 Cancelando orden: $OrderId" -ForegroundColor Cyan
Write-Host "📍 URL: $url" -ForegroundColor Gray
Write-Host "📦 Body: $body" -ForegroundColor Gray

try {
    $response = Invoke-RestMethod -Uri $url -Method POST -Body $body -ContentType "application/json"
    Write-Host "✅ Respuesta exitosa:" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 10) -ForegroundColor White
} catch {
    Write-Host "❌ Error:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Detalles: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
    }
}
