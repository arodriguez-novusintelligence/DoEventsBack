$endpoint = "https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders"

$payload = @{
    eventId = "804e0903-c17c-43de-a1a2-3384505a3547"
    userId = "cedef71c-c"
    tickets = @(
        @{
            ticketInstanceId = "a70608b3-6692-4abe-9ea4-4147895cc1f0"
            ticketsDistId = "e7268988-612a-415f-bf14-11f5bce63b89"
            createDate = "2026-02-10T17:04:15.343Z"
            purchasePrice = 60000
            categoryId = "ea5fe507-5448-43ec-8e1b-d9f245939e97"
            category = "VIP"
            categoryColor = "#F8BBD0"
            gateId = "50c80590-853e-49a9-ae57-57c335eccf02"
            gateName = "Puerta principal (Blanca)"
        }
    )
} | ConvertTo-Json -Depth 10

Write-Host "Creando orden con color y gate..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $endpoint -Method POST -Body $payload -ContentType 'application/json'
    
    Write-Host "Respuesta completa:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10 | Write-Host
    
    $orderId = $response.order_id
    Write-Host "Order ID: $orderId" -ForegroundColor Magenta
    
    if ($orderId) {
        Write-Host "Consultando orden..." -ForegroundColor Cyan
        Start-Sleep -Seconds 2
        $order = Invoke-RestMethod -Uri "$endpoint/$orderId" -Method GET
        
        Write-Host "Orden consultada:" -ForegroundColor Green
        $order | ConvertTo-Json -Depth 10 | Write-Host
        
        Write-Host "Verificando campos en el primer ticket:" -ForegroundColor Yellow
        $ticket = $order.data.order.tickets[0]
        Write-Host "  category_color: $($ticket.category_color)" -ForegroundColor $(if ($ticket.category_color) { "Green" } else { "Red" })
        Write-Host "  gate_id: $($ticket.gate_id)" -ForegroundColor $(if ($ticket.gate_id) { "Green" } else { "Red" })
        Write-Host "  gate_name: $($ticket.gate_name)" -ForegroundColor $(if ($ticket.gate_name) { "Green" } else { "Red" })
    }
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}
