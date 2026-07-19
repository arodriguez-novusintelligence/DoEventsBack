param(
    [string]$DistributionId = "90388e27-b32d-4ed8-a779-30e55f50e162",
    [string]$CreateDate = "2026-02-10T17:04:15.343Z",
    [string[]]$SeatIds = @("f5d49e0f-e8d0-4f93-890a-653780a152dc", "2c7b5559-0f04-416c-9c7c-24292c8945a5")
)

Write-Host "🔄 Liberando tickets manualmente..." -ForegroundColor Cyan
Write-Host "   Distribution: $DistributionId" -ForegroundColor Gray
Write-Host "   Seats: $($SeatIds -join ', ')" -ForegroundColor Gray

# Obtener la distribución
$dist = aws dynamodb get-item --table-name TicketsDistribution `
    --key "{`"id`": {`"S`": `"$DistributionId`"}, `"createDate`": {`"S`": `"$CreateDate`"}}" `
    --output json | ConvertFrom-Json

if (-not $dist.Item) {
    Write-Host "❌ Distribución no encontrada" -ForegroundColor Red
    exit 1
}

# Convertir DynamoDB format a objeto normal
$tickets = @()
foreach ($ticket in $dist.Item.tickets.L) {
    $t = @{}
    foreach ($key in $ticket.M.Keys) {
        $value = $ticket.M[$key]
        if ($value.S) { $t[$key] = $value.S }
        elseif ($value.N) { $t[$key] = [int]$value.N }
        elseif ($value.BOOL) { $t[$key] = $value.BOOL }
        elseif ($value.NULL) { $t[$key] = $null }
    }
    $tickets += $t
}

Write-Host "`n📊 Total tickets: $($tickets.Count)" -ForegroundColor White
$reserved = $tickets | Where-Object { $_.ticketStatus -eq "RESERVED" }
Write-Host "   RESERVED: $($reserved.Count)" -ForegroundColor Yellow

# Liberar los tickets especificados
$updated = 0
foreach ($ticket in $tickets) {
    if ($SeatIds -contains $ticket.seatId -and $ticket.ticketStatus -eq "RESERVED") {
        Write-Host "   ✓ Liberando seatId: $($ticket.seatId)" -ForegroundColor Green
        $ticket.ticketStatus = "AVAILABLE"
        $ticket.orderId = $null
        $ticket.ownerId = $null
        $ticket.reservationExpiry = $null
        $updated++
    }
}

if ($updated -eq 0) {
    Write-Host "`n⚠️  No se encontraron tickets RESERVED con esos seatIds" -ForegroundColor Yellow
    exit 0
}

Write-Host "`n💾 Actualizando distribución..." -ForegroundColor Cyan

# Convertir tickets de vuelta a formato DynamoDB
$dynamoTickets = @()
foreach ($ticket in $tickets) {
    $t = @{}
    foreach ($key in $ticket.Keys) {
        $val = $ticket[$key]
        if ($null -eq $val) {
            $t[$key] = @{ NULL = $true }
        }
        elseif ($val -is [int] -or $val -is [long]) {
            $t[$key] = @{ N = $val.ToString() }
        }
        elseif ($val -is [bool]) {
            $t[$key] = @{ BOOL = $val }
        }
        else {
            $t[$key] = @{ S = $val.ToString() }
        }
    }
    $dynamoTickets += @{ M = $t }
}

# Crear el item actualizado
$updatedItem = @{
    id = @{ S = $DistributionId }
    createDate = @{ S = $CreateDate }
    tickets = @{ L = $dynamoTickets }
}

# Copiar otros campos de la distribución original
foreach ($key in $dist.Item.Keys) {
    if ($key -ne "id" -and $key -ne "createDate" -and $key -ne "tickets") {
        $updatedItem[$key] = $dist.Item[$key]
    }
}

# Guardar
$itemJson = $updatedItem | ConvertTo-Json -Depth 10 -Compress
aws dynamodb put-item --table-name TicketsDistribution --item $itemJson

Write-Host "✅ Tickets liberados: $updated" -ForegroundColor Green
Write-Host "   Los asientos ahora están AVAILABLE" -ForegroundColor White
