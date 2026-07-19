# Script agresivo para limpiar versiones de Lambda - mantener solo 1 versión anterior
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
    Write-Host "Cleaning up function aggressively: $functionName"
    
    # Obtener todas las versiones (excluyendo $LATEST)
    $versions = aws lambda list-versions-by-function --function-name $functionName --region us-east-1 --query 'Versions[?Version!=`$LATEST`].Version' --output text
    
    if ($versions) {
        $versionArray = $versions -split "`t"
        # Mantener solo la última versión, eliminar todas las demás
        $versionsToDelete = $versionArray | Select-Object -First ([math]::Max(0, $versionArray.Count - 1))
        
        foreach ($version in $versionsToDelete) {
            if ($version -and $version.Trim() -ne "") {
                Write-Host "Deleting version $version from $functionName"
                aws lambda delete-function --function-name $functionName --qualifier $version --region us-east-1 2>$null
                Start-Sleep -Seconds 0.5  # Reducir el sleep para ir más rápido
            }
        }
    }
}

# También limpiar funciones del manageevents service
$manageeventsFunctions = @(
    "aws-lambda-manageevent-dev-createEvent",
    "aws-lambda-manageevent-dev-getEvents",
    "aws-lambda-manageevent-dev-updateEvent",
    "aws-lambda-manageevent-dev-rescheduleEvent",
    "aws-lambda-manageevent-dev-cancelEvent"
)

foreach ($functionName in $manageeventsFunctions) {
    Write-Host "Cleaning up manageevents function: $functionName"
    
    $versions = aws lambda list-versions-by-function --function-name $functionName --region us-east-1 --query 'Versions[?Version!=`$LATEST`].Version' --output text 2>$null
    
    if ($versions) {
        $versionArray = $versions -split "`t"
        # Mantener solo la última versión
        $versionsToDelete = $versionArray | Select-Object -First ([math]::Max(0, $versionArray.Count - 1))
        
        foreach ($version in $versionsToDelete) {
            if ($version -and $version.Trim() -ne "") {
                Write-Host "Deleting version $version from $functionName"
                aws lambda delete-function --function-name $functionName --qualifier $version --region us-east-1 2>$null
                Start-Sleep -Seconds 0.5
            }
        }
    }
}

Write-Host "Aggressive cleanup completed. Checking account usage..."
aws lambda get-account-settings --region us-east-1 --query 'AccountUsage'