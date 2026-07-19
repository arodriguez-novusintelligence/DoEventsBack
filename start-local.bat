@echo off
echo Starting DoEvents Local Development Environment...
echo.

echo Starting Notifications Service (Port 3030-3032)...
start "Notifications" cmd /k "cd aws-lambda-notifications && npm run dev"

timeout /t 3

echo Starting Chats Service (Port 3020-3022)...
start "Chats" cmd /k "cd aws-lambda-chats && npm run dev"

timeout /t 3

echo Starting WebSocket Gateway (Port 3010-3012)...
start "Gateway" cmd /k "cd aws-global-websocket-gateway && npm run dev"

echo.
echo All services starting...
echo.
echo WebSocket Gateway: ws://localhost:3010
echo Chats API: http://localhost:3021
echo Notifications API: http://localhost:3031
echo.
echo Press any key to exit...
pause