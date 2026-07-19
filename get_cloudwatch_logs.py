import boto3
import json
from datetime import datetime, timedelta

# Initialize CloudWatch Logs client
client = boto3.client('logs', region_name='us-east-1')

log_group_name = '/aws/lambda/aws-lambda-orders-manageTickets-dev-transferTicket'

# Get logs from last 12 hours
start_time = int((datetime.utcnow() - timedelta(hours=12)).timestamp() * 1000)

try:
    # Filter for schema errors
    response = client.filter_log_events(
        logGroupName=log_group_name,
        startTime=start_time,
        filterPattern='schema'
    )
    
    print(f"Found {len(response.get('events', []))} log events with 'schema'")
    print("=" * 80)
    
    for event in response.get('events', []):
        timestamp = datetime.fromtimestamp(event['timestamp'] / 1000)
        print(f"\nTimestamp: {timestamp}")
        print(f"Log Stream: {event['logStreamName']}")
        print(f"Message:\n{event['message']}")
        print("-" * 80)
        
except Exception as e:
    print(f"Error: {e}")
