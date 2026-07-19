$endpoint = "https://snddyz6gxb.execute-api.us-east-1.amazonaws.com/updateImages/804e0903-c17c-43de-a1a2-3384505a3547"

$payload = @{
    id_evento = "804e0903-c17c-43de-a1a2-3384505a3547"
    id_imagen = "ImagenesEvento792471"
    id_user = "cedef71c-c"
    list_image = @(
        @{
            nombreImagen = "test-image-1.jpg"
            ImagenB64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAAAAAAAAAAAAAAAAAAAACg=="
        }
    )
} | ConvertTo-Json -Depth 10

Write-Host "Actualizando imagenes del evento..." -ForegroundColor Cyan
Write-Host "Endpoint: $endpoint" -ForegroundColor Gray

try {
    $response = Invoke-RestMethod -Uri $endpoint -Method PUT -Body $payload -ContentType 'application/json'
    
    Write-Host "Respuesta exitosa:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10 | Write-Host
} catch {
    Write-Host "Error al actualizar imagenes:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Yellow
    
    if ($_.ErrorDetails) {
        Write-Host "Detalles del error:" -ForegroundColor Yellow
        $_.ErrorDetails.Message | Write-Host
    }
}
