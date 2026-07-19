# Script para consultar información de tickets de un evento
# Uso: .\get-event-tickets-info.ps1 -EventId "tu-event-id"

param(
    [Parameter(Mandatory=$true)]
    [string]$EventId
)

Write-Host "🔍 Consultando tickets para el evento: $EventId" -ForegroundColor Cyan
Write-Host ""

try {
    # Consultar la tabla Tickets por eventId usando el índice
    $result = aws dynamodb query `
        --table-name Tickets `
        --index-name eventIdIndex `
        --key-condition-expression "eventId = :eventId" `
        --expression-attribute-values "{`":eventId`":{`"S`":`"$EventId`"}}" `
        --region us-east-1 | ConvertFrom-Json

    if ($result.Count -eq 0 -or $result.Items.Count -eq 0) {
        Write-Host "❌ No se encontraron tickets para este evento" -ForegroundColor Red
        Write-Host "Verifica que el evento exista y que se haya clonado el venue correctamente" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "✅ Tickets encontrados!" -ForegroundColor Green
    Write-Host ""

    foreach ($item in $result.Items) {
        $ticketId = $item.id.S
        $venueId = if ($item.venueId.S) { $item.venueId.S } else { "N/A" }
        $hasSeating = if ($item.hasSeating.BOOL) { $item.hasSeating.BOOL } else { $false }
        
        Write-Host "📋 Ticket ID: $ticketId" -ForegroundColor Magenta
        Write-Host "🏢 Venue ID: $venueId" -ForegroundColor Gray
        Write-Host "💺 Has Seating: $hasSeating" -ForegroundColor Gray
        Write-Host ""
        Write-Host "🎫 CATEGORÍAS DISPONIBLES:" -ForegroundColor Yellow
        Write-Host "=" * 80 -ForegroundColor Gray

        if ($item.boletas.L) {
            $categorias = @()
            
            foreach ($boleta in $item.boletas.L) {
                $boletaMap = $boleta.M
                
                $categoria = @{
                    categoria = if ($boletaMap.categoria.S) { $boletaMap.categoria.S } else { "N/A" }
                    categoryId = if ($boletaMap.id.S) { $boletaMap.id.S } else { "N/A" }
                    cantidadTickets = if ($boletaMap.cantidadTickets.N) { $boletaMap.cantidadTickets.N } else { "0" }
                    avaliableCapacity = if ($boletaMap.avaliableCapacity.N) { $boletaMap.avaliableCapacity.N } else { "0" }
                    distributionId = if ($boletaMap.distributionId.S) { $boletaMap.distributionId.S } else { "N/A" }
                    distributionCreateDate = if ($boletaMap.distributionCreateDate.S) { $boletaMap.distributionCreateDate.S } else { "N/A" }
                    valor = if ($boletaMap.valor.N) { $boletaMap.valor.N } else { "0" }
                    moneda = if ($boletaMap.moneda.S) { $boletaMap.moneda.S } else { "COP" }
                }
                
                $categorias += $categoria
            }

            # Mostrar en tabla
            Write-Host ""
            $categorias | ForEach-Object {
                Write-Host "Categoría: $($_.categoria)" -ForegroundColor Cyan
                Write-Host "  - Category ID:           $($_.categoryId)" -ForegroundColor White
                Write-Host "  - Distribution ID:       $($_.distributionId)" -ForegroundColor Green
                Write-Host "  - Distribution Date:     $($_.distributionCreateDate)" -ForegroundColor Green
                Write-Host "  - Cantidad Total:        $($_.cantidadTickets)" -ForegroundColor White
                Write-Host "  - Disponibles:           $($_.avaliableCapacity)" -ForegroundColor White
                Write-Host "  - Precio:                $($_.valor) $($_.moneda)" -ForegroundColor White
                Write-Host ""
            }

            Write-Host "=" * 80 -ForegroundColor Gray
            Write-Host ""
            Write-Host "📝 EJEMPLO DE REQUEST PARA CREAR ORDEN:" -ForegroundColor Yellow
            Write-Host ""

            # Generar ejemplo de JSON para la orden
            $exampleTickets = @()
            foreach ($cat in $categorias) {
                $exampleTickets += @{
                    category = $cat.categoria
                    categoryId = $cat.categoryId
                    quantity = 1
                    ticketsDistId = $cat.distributionId
                    createDate = $cat.distributionCreateDate
                    seats = @()
                }
            }

            $exampleOrder = @{
                reference = "ORDER-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
                customer_email = "cliente@ejemplo.com"
                metadata = @{
                    eventId = $EventId
                    userID = "user-123"
                    tickets = $exampleTickets
                }
            }

            $jsonExample = $exampleOrder | ConvertTo-Json -Depth 10
            Write-Host $jsonExample -ForegroundColor White
            Write-Host ""
            
            # Guardar en archivo
            $outputFile = "order-request-$EventId.json"
            $jsonExample | Out-File -FilePath $outputFile -Encoding UTF8
            Write-Host "✅ Request de ejemplo guardado en: $outputFile" -ForegroundColor Green

        } else {
            Write-Host "⚠️  No hay categorías (boletas) configuradas para este evento" -ForegroundColor Yellow
        }
    }

} catch {
    Write-Host "❌ Error al consultar DynamoDB: $_" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}
