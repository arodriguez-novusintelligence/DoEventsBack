# Script para limpiar versiones antiguas de funciones Lambda
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

foreach ($functionName in $functions) {
    Write-Host "Cleaning up function: $functionName"
    
    # Obtener todas las versiones (excluyendo $LATEST)
    $versions = aws lambda list-versions-by-function --function-name $functionName --region us-east-1 --query 'Versions[?Version!=`$LATEST`].Version' --output text
    
    if ($versions) {
        $versionArray = $versions -split "`t"
        # Mantener solo las últimas 2 versiones, eliminar el resto
        $versionsToDelete = $versionArray | Select-Object -First ([math]::Max(0, $versionArray.Count - 2))
        
        foreach ($version in $versionsToDelete) {
            if ($version -and $version.Trim() -ne "") {
                Write-Host "Deleting version $version from $functionName"
                aws lambda delete-function --function-name $functionName --qualifier $version --region us-east-1 2>$null
                Start-Sleep -Seconds 1  # Evitar rate limiting
            }
        }
    }
}

Write-Host "Cleanup completed. Checking account usage..."
aws lambda get-account-settings --region us-east-1 --query 'AccountUsage'