# Script para actualizar un ticket de RESERVED a SOLD en TicketsDistribution
param(
    [Parameter(Mandatory=$true)]
    [string]$DistributionId,
    
    [Parameter(Mandatory=$true)]
    [string]$CreateDate,
    
    [Parameter(Mandatory=$true)]
    [string]$TicketInstanceId,
    
    [string]$Region = "us-east-1"
)

Write-Host "[INFO] Obteniendo distribucion..." -ForegroundColor Cyan

# Obtener la distribución actual
$distJson = aws dynamodb get-item `
    --table-name TicketsDistribution `
    --key "{\"id\": {\"S\": \"$DistributionId\"}, \"createDate\": {\"S\": \"$CreateDate\"}}" `
    --region $Region

if (!$distJson) {
    Write-Host "[ERROR] Distribucion no encontrada" -ForegroundColor Red
    exit 1
}

$dist = $distJson | ConvertFrom-Json

Write-Host "[OK] Distribucion encontrada: $($dist.Item.tickets.L.Count) tickets" -ForegroundColor Green

# Buscar el ticket específico y actualizar su estado
$ticketFound = $false
$ticketIndex = -1

for ($i = 0; $i -lt $dist.Item.tickets.L.Count; $i++) {
    $ticket = $dist.Item.tickets.L[$i].M
    if ($ticket.ticketInstanceId.S -eq $TicketInstanceId) {
        $ticketFound = $true
        $ticketIndex = $i
        Write-Host "[TICKET] Encontrado en indice $i" -ForegroundColor Yellow
        Write-Host "  Estado actual: $($ticket.ticketStatus.S)" -ForegroundColor Yellow
        Write-Host "  OrderId: $($ticket.orderId.S)" -ForegroundColor Yellow
        
        if ($ticket.ticketStatus.S -eq "SOLD") {
            Write-Host "[OK] El ticket ya esta en estado SOLD" -ForegroundColor Green
            exit 0
        }
        
        # Cambiar el estado a SOLD
        $dist.Item.tickets.L[$i].M.ticketStatus.S = "SOLD"
        break
    }
}

if (!$ticketFound) {
    Write-Host "[ERROR] Ticket $TicketInstanceId no encontrado en la distribucion" -ForegroundColor Red
    exit 1
}

Write-Host "[SAVE] Actualizando distribucion..." -ForegroundColor Cyan

# Convertir de vuelta a JSON para AWS CLI
$updateJson = $dist.Item | ConvertTo-Json -Depth 20 -Compress

# Guardar temporalmente en archivo
$tempFile = [System.IO.Path]::GetTempFileName() + ".json"
$updateJson | Out-File -FilePath $tempFile -Encoding UTF8

try {
    # Actualizar en DynamoDB
    aws dynamodb put-item `
        --table-name TicketsDistribution `
        --item file://$tempFile `
        --region $Region
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Ticket actualizado exitosamente a estado SOLD" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Error al actualizar el ticket" -ForegroundColor Red
        exit 1
    }
} finally {
    # Limpiar archivo temporal
    if (Test-Path $tempFile) {
        Remove-Item $tempFile -Force
    }
}
