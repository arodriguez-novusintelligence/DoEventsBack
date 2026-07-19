# Script para actualizar venue y regenerar distribuciones con color
# Evento: 00378638-8694-4b23-9ab3-746ed67e76f8
# Venue: 581b9bb9-57e4-4300-a818-f50fe3e10e0e

$venueId = "581b9bb9-57e4-4300-a818-f50fe3e10e0e"
$endpoint = "https://6jmu2drmce.execute-api.us-east-1.amazonaws.com/dev/venues/$venueId"

# Payload de ejemplo - DEBES AJUSTAR con las categorías reales y sus colores
$payload = @{
    eventId = "00378638-8694-4b23-9ab3-746ed67e76f8"
    name = "Place New Orders"
    hasSeating = $true
    categories = @(
        @{
            id = "cf3e0a2a-03c7-450f-8b56-621113e995a7"
            name = "GENERAL"
            categoria = "GENERAL"
            color = "#3498db"  # Azul - AJUSTA ESTE COLOR
            cantidadTickets = 20
            valor = 50000
            moneda = "COP"
            descripcion = "Categoría General"
        },
        @{
            id = "c5081a9b-203c-43a7-8fda-a37172dbb0fc"
            name = "PALCO"
            categoria = "PALCO"
            color = "#e74c3c"  # Rojo - AJUSTA ESTE COLOR
            cantidadTickets = 20
            valor = 100000
            moneda = "COP"
            descripcion = "Categoría Palco"
        },
        @{
            id = "e1d5cf20-2b74-481b-ae3c-10cd6b59f1be"
            name = "VIP"
            categoria = "VIP"
            color = "#f39c12"  # Naranja - AJUSTA ESTE COLOR
            cantidadTickets = 20
            valor = 150000
            moneda = "COP"
            descripcion = "Categoría VIP"
        },
        @{
            id = "6ab0acee-8cdd-4b43-bf74-5d1de5a6546d"
            name = "PREMIUM"
            categoria = "PREMIUM"
            color = "#9b59b6"  # Púrpura - AJUSTA ESTE COLOR
            cantidadTickets = 20
            valor = 200000
            moneda = "COP"
            descripcion = "Categoría Premium"
        }
    )
} | ConvertTo-Json -Depth 10

Write-Host "🔄 Actualizando venue con categorías y colores..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Endpoint: $endpoint" -ForegroundColor Gray
Write-Host ""
Write-Host "IMPORTANTE: Revisa los colores en el payload antes de ejecutar!" -ForegroundColor Yellow
Write-Host ""
Write-Host "Para ejecutar la actualización, ejecuta:" -ForegroundColor Green
Write-Host "Invoke-RestMethod -Uri `"$endpoint`" -Method PUT -Body `$payload -ContentType 'application/json'" -ForegroundColor White
Write-Host ""
Write-Host "Payload a enviar:" -ForegroundColor Cyan
Write-Host $payload -ForegroundColor Gray
