# Runner: ejecuta cleanup-lambda-versions-safe.ps1 usando la lista predefinida de funciones
# Ejecuta en modo DryRun por seguridad

$functions = @(
    "notifications-dev-triggerNotification",
    "notifications-dev-updateNotificationsById",
    "notifications-dev-getUserMessagingTokenByUserId",
    "notifications-dev-inAppNotificationHandler",
    "notifications-dev-whatsappNotificationHandler",
    "notifications-dev-notifyEventAffectedUsers",
    "notifications-dev-createUserMessagingToken",
    "notifications-dev-updateUserMessagingToken",
    "notifications-dev-pushNotificationHandler",
    "notifications-dev-emailNotificationHandler",
    "notifications-dev-getNotificationByUserId"
)

$scriptPath = Join-Path $PSScriptRoot 'cleanup-lambda-versions-safe.ps1'
if (-not (Test-Path $scriptPath)) {
    Write-Error "No se encontró $scriptPath. Asegúrate que exista en el mismo directorio."
    exit 1
}

Write-Host "Running dry-run cleanup for functions:`n  $($functions -join "`n  ")" -ForegroundColor Cyan

# Ejecutar en DryRun
& $scriptPath -Functions $functions -Keep 2 -DryRun

Write-Host "Dry-run finished. Review output above. To perform actual deletion, run the same command without -DryRun." -ForegroundColor Green
