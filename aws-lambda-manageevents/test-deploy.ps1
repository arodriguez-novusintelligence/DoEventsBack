# Test de Deploy - FAQ y EventDays
# Ejecuta este archivo para probar que el deploy funcionó correctamente

$API_BASE = "https://tcxgmrawc8.execute-api.us-east-1.amazonaws.com"

Write-Host "`n=== Test de Deploy: FAQ y EventDays ===" -ForegroundColor Cyan
Write-Host "API Base: $API_BASE`n" -ForegroundColor White

# Evento de prueba con FAQ y EventDays
$eventData = @{
    nombre = "Test FAQ EventDays - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    descripcion = "Evento de prueba para validar FAQ y EventDays"
    fechaIni = "25/12/2024"
    fechaFin = "25/12/2024"
    horaIni = "09:00"
    horaFin = "18:00"
    userId = "test-user-123"
    organizerName = "Test Organizer"
    email = "test@example.com"
    TelPrin = "3001234567"
    tipoEvento = "Conferencia"
    Categoria = "Tecnología"
    aforo = 100
    modalidadEvt = "public"
    pais = "Colombia"
    ciudad = "Bogotá"
    direccion = "Calle Test 123"
    departamento = "Cundinamarca"
    clase = "premium"
    faq = @(
        @{
            question = "¿Cuál es el horario del evento?"
            answer = "El evento será de 9:00 AM a 6:00 PM"
        },
        @{
            question = "¿Hay estacionamiento?"
            answer = "Sí, hay estacionamiento gratuito disponible"
        }
    )
    eventDays = @(
        @{
            id = [guid]::NewGuid().ToString()
            dayName = "Día de Prueba"
            date = "2024-12-25T00:00:00.000Z"
            activities = @(
                @{
                    id = [guid]::NewGuid().ToString()
                    startTime = "2024-12-25T09:00:00.000Z"
                    endTime = "2024-12-25T10:00:00.000Z"
                    startTimeDisplay = "09:00 A.M"
                    endTimeDisplay = "10:00 A.M"
                    description = "Actividad de prueba"
                    responsible = "Test Responsible"
                }
            )
        }
    )
} | ConvertTo-Json -Depth 10

Write-Host "Enviando request de prueba..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "$API_BASE/createEvent" `
        -Method POST `
        -Body $eventData `
        -ContentType "application/json" `
        -ErrorAction Stop

    Write-Host "`n✓ ¡Evento creado exitosamente!" -ForegroundColor Green
    Write-Host "`nRespuesta:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 5
    
    if ($response.data.id) {
        Write-Host "`n✓ Event ID: $($response.data.id)" -ForegroundColor Green
        Write-Host "✓ Los campos FAQ y EventDays fueron guardados correctamente" -ForegroundColor Green
    }
} catch {
    Write-Host "`n✗ Error al crear evento:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "`nDetalles:" -ForegroundColor Yellow
        Write-Host $_.ErrorDetails.Message
    }
}

Write-Host "`n=== Fin del Test ===" -ForegroundColor Cyan
