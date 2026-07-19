#!/usr/bin/env python3
import json
import subprocess
import time

payload = {
    "templateKey": "EVENT_INVITATION",
    "channels": ["whatsapp"],
    "metadata": {
        "userId": "user-prueba-001",
        "eventId": "evt-prueba-001",
        "eventName": "Test Event After Deploy",
        "inviterName": "John",
        "favoriteUserName": "Jane"
    }
}

print("Enviando prueba post-deploy...")
result = subprocess.run([
    "aws", "lambda", "invoke",
    "--function-name", "notifications-dev-triggerNotification",
    "--cli-binary-format", "raw-in-base64-out",
    "--payload", json.dumps(payload),
    "--region", "us-east-1",
    "/tmp/test_result.json"
], capture_output=True, text=True)

print("Esperando logs...")
time.sleep(2)

logs_result = subprocess.run([
    "aws", "logs", "tail",
    "/aws/lambda/notifications-dev-triggerNotification",
    "--since=5s", "--region", "us-east-1"
], capture_output=True, text=True)

if "does not exist in the translation" in logs_result.stdout:
    print("❌ ERROR: Template sigue sin existir")
    for line in logs_result.stdout.split("\n"):
        if "does not" in line.lower():
            print("  ", line[:200])
elif "event_invitations" in logs_result.stdout:
    print("✅ SUCCESS: event_invitations encontrado!")
    for line in logs_result.stdout.split("\n"):
        if "event_invitations" in line or "whatsapp" in line.lower():
            print("  ", line[:150])
else:
    print("Checking logs...")
    for line in logs_result.stdout.split("\n"):
        if "whatsapp" in line.lower() or "template" in line.lower():
            print("  ", line[:150])
