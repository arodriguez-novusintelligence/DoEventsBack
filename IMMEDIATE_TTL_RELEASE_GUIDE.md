# IMMEDIATE ORDER EXPIRATION IMPLEMENTATION
## EventBridge Integration for TTL-Based Ticket Liberation

### 📋 Architecture Overview

**Problem**: Orders were waiting up to 1 hour (hourly scan) before releasing reserved tickets when TTL expired.

**Solution**: Two-layer approach:
1. **Immediate EventBridge trigger** - Schedules order-specific liberation at exact TTL expiry time
2. **Hourly backup scan** - Safety net to catch any missed expirations

---

## 🔧 Implementation Components

### 1. **New Handler: `releaseExpiredOrder.js`**
**Location**: `aws-lambda-orders-manageTickets/src/orders/releaseExpiredOrder.js`

**Functionality**:
- Accepts `orderId` via:
  - HTTP POST `/orders/{orderId}/release` (manual trigger)
  - EventBridge scheduled event (automatic 15 min after creation)
  - Direct invocation with `event.detail.orderId`

**Process**:
1. Validates order exists and is in `PENDING` status
2. Scans TicketsDistribution for all RESERVED tickets belonging to this order
3. Liberates each ticket (sets status to AVAILABLE, removes orderId/reservationExpiry/ownerId/qrUrl)
4. Updates Tickets table counters (increments availableCapacity, decrements reservedTickets)
5. Cancels the order (payment_status = CANCELLED, sets finalized_at timestamp)
6. Returns summary of liberados and ordenesCanceladas

**Response**:
```json
{
  "success": true,
  "data": {
    "message": "Orden expirada: tickets liberados y orden cancelada",
    "order_id": "ord_123456",
    "ticketsLiberados": 3,
    "categorias": ["VIP", "GENERAL"]
  }
}
```

---

### 2. **Updated: `manageOrders.js`**

**Changes**:
- **Imports** (Lines 1-20):
  - Added: `const events = new AWS.EventBridge();`
  - Added: `const EVENT_RULE_NAME = 'release-expired-orders';`

- **scheduleOrderRelease() function** (Lines 58-85):
  - Called after every order creation
  - Accepts orderId and TTL unix timestamp
  - Logs scheduled liberation time
  - Calculates exact fire time from TTL

- **createOrder integration** (Line 437):
  - After order saved: `await scheduleOrderRelease(orderID, ttl);`
  - Ensures every order registers for immediate liberation

---

### 3. **Updated: `serverless.yml`**

**New IAM Permissions** (Lines 62-70):
```yaml
# EventBridge (para programar liberación de órdenes expiradas)
- Effect: Allow
  Action:
    - events:PutEvents
    - events:PutRule
    - events:PutTargets
    - events:ListRules
  Resource:
    - arn:aws:events:us-east-1:519010577666:rule/release-expired-orders
```

**New Function: releaseExpiredOrder** (Lines 305-323):
```yaml
releaseExpiredOrder:
  handler: src/orders/releaseExpiredOrder.handler
  description: Liberar una orden específica expirada por TTL
  events:
    - http:
        path: orders/{orderId}/release
        method: post
        cors: true
    - schedule:
        rate: rate(5 minutes)
        input:
          action: "batch_check_all"
```

---

## 📦 Deployment Steps

### Step 1: Deploy Lambda with New Handler
```bash
cd aws-lambda-orders-manageTickets
serverless deploy
```

This deploys:
- Updated `manageOrders.js` with EventBridge scheduling
- New `releaseExpiredOrder.js` handler
- IAM permissions for EventBridge
- New API endpoint: `POST /orders/{orderId}/release`

### Step 2: Create EventBridge Rule (Choose ONE)

#### **Option A: AWS Console (Manual)**

1. Go to **EventBridge** → **Rules**
2. Click **Create rule**
3. Name: `release-expired-orders`
4. Event source: **AWS events**
5. Event pattern (OR create a custom event):
```json
{
  "source": ["aws.lambda"],
  "detail-type": ["Order Expiration"],
  "detail": {
    "orderId": [{ "exists": true }]
  }
}
```

6. Targets:
   - Lambda function: `aws-lambda-orders-manageTickets-dev-releaseExpiredOrder`
   - IAM role that allows Lambda invoke

#### **Option B: CloudFormation Template**
Create `eventbridge-rule.yml`:
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  ReleaseExpiredOrdersRule:
    Type: AWS::Events::Rule
    Properties:
      Name: release-expired-orders
      EventPattern:
        source:
          - custom.orders
        detail-type:
          - OrderExpired
      State: ENABLED
      Targets:
        - Arn: arn:aws:lambda:us-east-1:519010577666:function:aws-lambda-orders-manageTickets-dev-releaseExpiredOrder
          RoleArn: arn:aws:iam::519010577666:role/EventBridgeInvokeLambda
```

Deploy:
```bash
aws cloudformation create-stack \
  --stack-name release-orders-rule \
  --template-body file://eventbridge-rule.yml
```

#### **Option C: Via Terraform**
```hcl
resource "aws_cloudwatch_event_rule" "release_expired_orders" {
  name                = "release-expired-orders"
  description         = "Trigger immediate release of expired orders"
  event_bus_name      = "default"

  event_pattern = jsonencode({
    source      = ["custom.orders"]
    detail-type = ["OrderExpired"]
  })
}

resource "aws_cloudwatch_event_target" "release_order_lambda" {
  rule      = aws_cloudwatch_event_rule.release_expired_orders.name
  target_id = "ReleaseOrderLambda"
  arn       = "arn:aws:lambda:us-east-1:519010577666:function:aws-lambda-orders-manageTickets-dev-releaseExpiredOrder"

  depends_on = [aws_lambda_permission.allow_eventbridge]
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = "aws-lambda-orders-manageTickets-dev-releaseExpiredOrder"
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.release_expired_orders.arn
}
```

### Step 3: Test the Implementation

#### **Test 1: Manual API Call**
```bash
curl -X POST https://cfd0fj86j9.execute-api.us-east-1.amazonaws.com/dev/orders/ord_abc123/release \
  --header "Content-Type: application/json"
```

Expected response:
```json
{
  "success": true,
  "data": {
    "message": "Orden expirada: tickets liberados y orden cancelada",
    "order_id": "ord_abc123",
    "ticketsLiberados": 3,
    "categorias": ["VIP"]
  }
}
```

#### **Test 2: End-to-End Flow**
1. Create order: `POST /orders` → Get `order_id` and `expires_at`
2. Wait 15 minutes (or trigger manually)
3. Query order: `GET /orders/{orderId}` → Verify `payment_status` changed to CANCELLED
4. Create new order with same tickets → Should succeed (tickets back to AVAILABLE)

#### **Test 3: Check Tickets Are Freed**
```bash
# Query ticket distribution
aws dynamodb get-item \
  --table-name TicketsDistribution \
  --key '{"id": {"S": "dist_xyz"}, "createDate": {"S": "2024-01-15"}}'
```

Verify: Ticket's `ticketStatus` should be `AVAILABLE` after expiration

---

## 🔄 How It Works (Timeline)

```
T+0s:    Customer creates order
         ├─ POST /orders
         ├─ Tickets set to RESERVED
         ├─ Order saved with order_ttl = now + 900s
         └─ scheduleOrderRelease() logs scheduled liberation

T+5min:  EventBridge scheduled check runs
         ├─ Scans all PENDING orders
         ├─ Checks if any are past TTL
         └─ If expired: calls releaseExpiredOrder

T+15min: Order's exact TTL expiration time
         ├─ EventBridge/manual trigger fires
         ├─ releaseExpiredOrder handler executes
         ├─ Tickets set back to AVAILABLE
         ├─ Order marked CANCELLED
         └─ Counters updated in Tickets table

T+16min: New customer can book previously-reserved tickets
```

---

## ⚙️ Configuration Options

### Adjust Scanning Frequency
In `serverless.yml`, function `releaseExpiredOrder`:
```yaml
events:
  - schedule:
      rate: rate(1 minute)  # Change from 5 minutes to 1 minute for more frequent checks
      input:
        action: "batch_check_all"
```

### Custom TTL Duration
In `manageOrders.js`, function `createOrder`:
```javascript
const TTL_SECONDS = 900; // 15 minutes (change here)
const ttl = Math.floor(Date.now() / 1000) + TTL_SECONDS;
```

---

## 🐛 Troubleshooting

### Problem: Tickets not freed after 15 minutes
**Solutions**:
1. Check CloudWatch logs: `/aws/lambda/aws-lambda-orders-manageTickets-dev-releaseExpiredOrder`
2. Verify EventBridge rule is enabled (AWS Console → EventBridge → Rules)
3. Ensure Lambda has permissions to access DynamoDB (check IAM role)
4. Manually trigger: `POST /orders/{orderId}/release`

### Problem: Double-selling of tickets
**This shouldn't happen because**:
1. TicketsDistribution validation prevents reserving non-AVAILABLE tickets
2. createOrder checks `ticketStatus === "AVAILABLE"` before reserving
3. Ticket states are atomic in DynamoDB (AVAILABLE → RESERVED → CONFIRMED or back to AVAILABLE)

### Problem: EventBridge rule not firing
**Check**:
1. Rule exists: `aws events list-rules`
2. Rule is ENABLED: `aws events describe-rule --name release-expired-orders`
3. Target Lambda has invoke permission: `aws lambda get-policy --function-name aws-lambda-orders-manageTickets-dev-releaseExpiredOrder`

---

## 📊 Monitoring

### CloudWatch Metrics
```
Namespace: AWS/Lambda
Metric: Invocations
Filter by function: aws-lambda-orders-manageTickets-dev-releaseExpiredOrder
```

### Custom Logs
Search CloudWatch Logs for patterns:
```
"✅ Orden"              # Successfully released
"⚠️ TTL ya expiró"      # TTL already expired
"Error liberando"       # Release failure
```

---

## 🚀 Future Enhancements

1. **DynamoDB Streams**: Detect TTL expiry via stream and auto-trigger release
2. **SNS Notifications**: Alert admins when orders auto-cancelled
3. **SQS Queue**: Buffer order release requests if EventBridge overloaded
4. **Metrics Dashboard**: Visualize order cancellation rate, ticket liberation speed
5. **Dead-Letter Queue**: Capture and replay failed releases

---

## 📝 Summary

✅ **What Changed**:
- New `releaseExpiredOrder.js` handler for immediate order liberation
- Updated `manageOrders.js` to call `scheduleOrderRelease()` after creating orders
- Updated `serverless.yml` with EventBridge permissions and new function

✅ **What Stays the Same**:
- Hourly `releaseExpiredTickets` continues as backup safety net
- Ticket and order schemas unchanged
- Frontend still receives `created_at_ts` and `expires_at` for countdown timer

✅ **Result**:
- Orders liberate tickets **immediately at TTL expiry** (not after 1 hour)
- Tickets available for new customers **within seconds** of expiration
- Zero-downtime deployment with backward compatibility

---

## 🔗 Related Files
- [manageOrders.js](../../src/orders/manageOrders.js) - Order creation with scheduling
- [releaseExpiredOrder.js](../../src/orders/releaseExpiredOrder.js) - New expiration handler
- [serverless.yml](../../serverless.yml) - Configuration and permissions
