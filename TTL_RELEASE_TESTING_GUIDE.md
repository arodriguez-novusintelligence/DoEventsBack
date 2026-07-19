# 🧪 Testing the Immediate Order Release System

## Quick Test Guide

### Scenario 1: Manual Release Testing (No EventBridge Setup Required)

#### Step 1: Create an Order
```bash
curl -X POST https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders \
  -H "Authorization: AWS4-HMAC-SHA256 ..." \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "evt_test_123",
    "user_id": "usr_test_456",
    "currency": "COP",
    "amount": 50000,
    "tickets": [
      {
        "ticket_id": "ticket_1",
        "ticketsDistId": "dist_001",
        "distributionCreateDate": "2024-01-15",
        "purchasePrice": 25000,
        "category": "VIP",
        "location": "Section A",
        "additionalCharges": [
          {
            "name": "Service Fee",
            "amount": 2500
          }
        ]
      }
    ]
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "message": "Orden creada y tickets reservados.",
    "order_id": "ord_abc123xyz",
    "reference": "ord_abc123xyz",
    "created_at": "2024-01-20T10:30:00Z",
    "created_at_ts": 1705756200,
    "expires_at": "2024-01-20T10:45:00Z",
    "payment_status": "PENDING",
    "currency": "COP",
    "amount": 50000,
    "tickets": [
      {
        "ticket_id": "ticket_1",
        "category": "VIP",
        "qr_url": "https://ticket-qr-dev.s3.amazonaws.com/qrs/ord_abc123xyz_ticket_1.png?...",
        "price": 25000,
        "total_amount": 27500
      }
    ]
  }
}
```

**Save the `order_id`** from response (e.g., `ord_abc123xyz`)

---

#### Step 2: Verify Order is PENDING
```bash
curl -X GET https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders/ord_abc123xyz
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "order_id": "ord_abc123xyz",
    "payment_status": "PENDING",
    "order_ttl": 1705756500,  // Unix timestamp of expiration
    "created_at_ts": 1705756200,
    "expires_at": "2024-01-20T10:45:00Z",
    "tickets": [...]
  }
}
```

---

#### Step 3: Manually Trigger Release (Simulating TTL Expiry)
```bash
curl -X POST https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders/ord_abc123xyz/release \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "message": "Orden expirada: tickets liberados y orden cancelada",
    "order_id": "ord_abc123xyz",
    "ticketsLiberados": 1,
    "categorias": ["VIP"]
  }
}
```

---

#### Step 4: Verify Order is Now CANCELLED
```bash
curl -X GET https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders/ord_abc123xyz
```

**Expected Response**:
```json
{
  "success": true,
  "data": {
    "order_id": "ord_abc123xyz",
    "payment_status": "CANCELLED",    // ← Changed from PENDING
    "finalized_at": "2024-01-20T10:35:45Z",  // ← Timestamp added
    "tickets": [
      {
        "ticket_id": "ticket_1",
        "ticketStatus": "AVAILABLE",   // ← Reverted from RESERVED
        "orderId": null                 // ← Cleared
      }
    ]
  }
}
```

---

#### Step 5: Verify Tickets Are Free (Create Another Order)
```bash
curl -X POST https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders \
  -H "Authorization: AWS4-HMAC-SHA256 ..." \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "evt_test_123",
    "user_id": "usr_test_789",
    "currency": "COP",
    "amount": 50000,
    "tickets": [
      {
        "ticket_id": "ticket_1",     # Same ticket as before!
        "ticketsDistId": "dist_001",
        "distributionCreateDate": "2024-01-15",
        "purchasePrice": 25000,
        "category": "VIP",
        "location": "Section A",
        "additionalCharges": []
      }
    ]
  }'
```

**Expected**: ✅ Success! Same ticket is now available for new customer
**Failure**: ❌ "Ticket not available" → Check if release actually completed

---

### Scenario 2: Check CloudWatch Logs

View release operation logs:
```bash
# View logs from releaseExpiredOrder Lambda
aws logs tail /aws/lambda/aws-lambda-orders-manageTickets-dev-releaseExpiredOrder --follow

# Or search for specific order
aws logs filter-log-events \
  --log-group-name /aws/lambda/aws-lambda-orders-manageTickets-dev-releaseExpiredOrder \
  --filter-pattern "ord_abc123xyz"
```

**Expected Log Entries**:
```
🔄 Liberando orden expirada: ord_abc123xyz
   - Liberando ticket ticket_1 de orden ord_abc123xyz
   ✅ Contadores actualizados: evento=evt_test_123, cat=VIP, liberados=1
✅ Orden ord_abc123xyz cancelada y tickets liberados (total: 1)
```

---

### Scenario 3: Automated Scheduled Release (With EventBridge)

Once EventBridge rule is set up:

#### Setup (One-Time):
```bash
# Create EventBridge rule
aws events put-rule \
  --name release-expired-orders \
  --event-bus-name default \
  --state ENABLED \
  --description "Release expired orders automatically"

# Add Lambda as target
aws events put-targets \
  --rule release-expired-orders \
  --targets "Id"="1","Arn"="arn:aws:lambda:us-east-1:519010577666:function:aws-lambda-orders-manageTickets-dev-releaseExpiredOrder","RoleArn"="arn:aws:iam::519010577666:role/EventBridgeInvokeLambda"

# Grant EventBridge permission to invoke Lambda
aws lambda add-permission \
  --function-name aws-lambda-orders-manageTickets-dev-releaseExpiredOrder \
  --statement-id AllowEventBridgeInvoke \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:us-east-1:519010577666:rule/release-expired-orders
```

#### Test Scheduled Release:
```bash
# Create order
ORDER_ID=$(curl -s -X POST ... | jq -r '.data.order_id')

# Wait for TTL (or schedule manual trigger)
sleep 15m

# Or manually invoke to test:
aws lambda invoke \
  --function-name aws-lambda-orders-manageTickets-dev-releaseExpiredOrder \
  --payload '{"detail": {"orderId": "'$ORDER_ID'"}}' \
  response.json

cat response.json
```

---

## 📊 Verification Checklist

### After Manual Release:
- [ ] `POST /orders/{orderId}/release` returns success
- [ ] Order `payment_status` changes from PENDING to CANCELLED
- [ ] Order gets `finalized_at` timestamp
- [ ] CloudWatch shows "✅ Orden ... cancelada"
- [ ] Tickets back to AVAILABLE in TicketsDistribution
- [ ] Ticket counters updated in Tickets table
- [ ] New order can use same tickets

### After EventBridge Setup:
- [ ] EventBridge rule exists and is ENABLED
- [ ] Lambda has invoke permission from events
- [ ] Create order and wait 15+ minutes
- [ ] Order auto-cancels without manual trigger
- [ ] CloudWatch shows automatic release

---

## 🐛 Troubleshooting Tests

### Test 1: Verify Order Not Already Cancelled
```bash
curl -X POST https://rxlggkh3ud.execute-api.us-east-1.amazonaws.com/dev/orders/{orderId}/release
```

**If returns**: `"Orden ... ya no está en PENDING (status=CANCELLED)"`
- ✅ Correct: Order was already released
- ❌ Error: Check why it was pre-cancelled

### Test 2: Check Ticket Status Before/After
```bash
# Before release:
aws dynamodb get-item \
  --table-name TicketsDistribution \
  --key '{"id": {"S": "dist_001"}, "createDate": {"S": "2024-01-15"}}'

# Check: ticket.ticketStatus should be "RESERVED"
# Check: ticket.orderId should be "ord_abc123xyz"

# [Release order]

# After release:
aws dynamodb get-item \
  --table-name TicketsDistribution \
  --key '{"id": {"S": "dist_001"}, "createDate": {"S": "2024-01-15"}}'

# Check: ticket.ticketStatus should be "AVAILABLE"
# Check: ticket.orderId should be null or removed
```

### Test 3: Verify Counters Updated
```bash
# Check Tickets table counter before
aws dynamodb get-item \
  --table-name Tickets \
  --key '{"id": {"S": "evt_test_123"}}'

# In response, find boleta array for "VIP":
#   avaliableCapacity should be X
#   reservedTickets should be Y

# [Release order]

# Check after:
# avaliableCapacity should be X+1
# reservedTickets should be Y-1 (or 0 if was 1)
```

---

## 🎯 Expected Behavior Summary

| State | Before Release | After Release |
|-------|--|--|
| Order `payment_status` | PENDING | CANCELLED |
| Ticket `ticketStatus` | RESERVED | AVAILABLE |
| Ticket `orderId` | ord_abc123xyz | null/removed |
| Ticket `reservationExpiry` | 15-min date | removed |
| Ticket `qrUrl` | signed S3 URL | removed |
| Counters `avaliableCapacity` | N | N+1 |
| Counters `reservedTickets` | M | M-1 |

---

## 📞 Support

**If release fails**:
1. Check CloudWatch logs for errors
2. Verify order exists and is PENDING
3. Ensure DynamoDB access permissions
4. Check ticket exists in TicketsDistribution

**If EventBridge doesn't fire**:
1. Confirm rule is ENABLED: `aws events describe-rule --name release-expired-orders`
2. Check Lambda invoke permission exists
3. View EventBridge rule targets: `aws events list-targets-by-rule --rule release-expired-orders`

---

## 💡 Next Steps

1. ✅ Deploy Lambda - **Complete**
2. ⏳ Set up EventBridge rule (if desired) - See guide
3. 🧪 Run manual tests above
4. 📊 Monitor production orders with real customers
5. 📈 Adjust TTL or scan frequency if needed

