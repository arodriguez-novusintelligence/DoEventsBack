# Test transfer
$endpoint = "https://lnyy0iegb9.execute-api.us-east-1.amazonaws.com/dev"
$auth = "Bearer eyJraWQiOiIxUU9pYkNNZU9CZ3E2WDllR09DZFFzWndhQUJGSGxqbHRHRm9YQk1uZ3lrPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiI0MmMyZTRhNC0wMzkyLTcwNjItNDA0ZS1iNzk4NGMzYzU4YTMiLCJjb2duaXRvOmdyb3VwcyI6WyJhZG1pbiJdLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAudXMtZWFzdC0xLmFtYXpvbmF3cy5jb21cL3VzLWVhc3QtMV9EMWt3WklpMHAiLCJ2ZXJzaW9uIjoyLCJjbGllbnRfaWQiOiI2dW1qOHVvZXFtNDdpYzRhN200cXExaDM4NiIsIm9yaWdpbl9qdGkiOiJlZjY5MGM4My00MDg1LTRlMWEtYTIwNC1mMmJkMjU3MjEyZTUiLCJ0b2tlbl91c2UiOiJhY2Nlc3MiLCJzY29wZSI6Im9wZW5pZCBwcm9maWxlIGVtYWlsIiwiYXV0aF90aW1lIjoxNzM4OTgzNzI4LCJleHAiOjE3Mzk4NjUzMzYsImlhdCI6MTczOTg2MTczNiwianRpIjoiZmJjNTkyYjUtYjQxNC00NGJmLTlmMjItMGY3NDQ5ZmIwYzU0IiwidXNlcm5hbWUiOiI0MmMyZTRhNC0wMzkyLTcwNjItNDA0ZS1iNzk4NGMzYzU4YTMifQ.VdNwLUP6M0LcjQ3l9mBwn3d1nnCmUCGhqTgRUbUCRy8V4m1xb4IQCU9TXpZkwqU8P9ky_Q-xPL_MZw-UxW5S_r8RrePQlrFTuA2VfbTsjtzFwQxGBxwzZY8BZVBdMUXP_pW5UKx8CzbDi1SZXwISW4UqTw5hRf1pYOkLG-sD-MQP6YQ_YP1aZWOIWe7wm2CzqBRwqRbcVD4mf3hJe6d1MwT9SjAGx-3PjVvG2SArPdNwScvWdgC4dKIgFbuwAZVgYTD3QVkZznBElZjR5z18rMZKNpRcZ1mJ7BEy8B4qUHBzJeRYXPSzCMqpLBFdGHYLx5Mfek_eQXUxsABx4zBB2A"

$body = @{
    "orderID" = "test_3pdRQq"
    "ticketIDs" = @("60b3c523-5e42-4ab5-947f-8c0aff371a53")
    "currentUserID" = "42c2e4a4-0"
    "newUserID" = "test-user-receiver"
} | ConvertTo-Json

Write-Host "Intentando transferir ticket..." -ForegroundColor Cyan
Write-Host "Body: $body" -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod `
        -Uri "$endpoint/tickets/transfer" `
        -Method Post `
        -Headers @{
            "Authorization" = $auth
            "Content-Type" = "application/json"
        } `
        -Body $body
    
    Write-Host "Respuesta exitosa:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error en la transferencia:" -ForegroundColor Red
    Write-Host "StatusCode: $($_.Exception.Response.StatusCode.value__)"
    Write-Host "Message: $($_.Exception.Message)"
    
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
    }
}
