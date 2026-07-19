// src/ticket/generateTickets.js
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// No redefinimos AWS_REGION, Lambda ya lo suministra automáticamente
AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

const ORDERS_TABLE  = process.env.ORDERS_TABLE;
const TICKETS_TABLE = process.env.TICKETS_TABLE;

exports.handler = async (event) => {
  // Función para formatear la respuesta
  const buildResponse = (statusCode, body) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body, null, 2)
  });

  // 0) Parsear body
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (parseError) {
    console.error('JSON parse error:', parseError);
    return buildResponse(400, {
      error:        'InvalidJSON',
      message:      parseError.message,
      stack:        parseError.stack
    });
  }

  const { orderID, userID } = body;
  // 1) Validar parámetros
  if (!orderID || !userID) {
    return buildResponse(400, {
      error:   'MissingParameters',
      message: 'orderID y userID son requeridos',
      received: { orderID, userID }
    });
  }

  // 2) Recuperar la orden
  let order;
  try {
    const result = await doc.get({
      TableName: ORDERS_TABLE,
      Key:       { order_id: orderID }
    }).promise();
    order = result.Item;
  } catch (ddbGetError) {
    console.error('DynamoDB GetItem error:', ddbGetError);
    return buildResponse(500, {
      error:   'DynamoDBGetError',
      message: ddbGetError.message,
      stack:   ddbGetError.stack
    });
  }

  if (!order) {
    return buildResponse(404, {
      error:   'OrderNotFound',
      message: `No existe la orden con ID ${orderID}`
    });
  }

  // 3) Validar userID
  if (order.user_id !== userID) {
    return buildResponse(403, {
      error:   'Unauthorized',
      message: 'El userID no coincide con la orden'
    });
  }

  // 4) Validar cantidad
  const { event_id, quantity } = order;
  if (!quantity || quantity < 1) {
    return buildResponse(400, {
      error:   'InvalidQuantity',
      message: 'La orden tiene una cantidad inválida',
      quantity
    });
  }

  // 5) Generar tickets
  const now = new Date().toISOString();
  const writes  = [];
  const created = [];
  for (let i = 0; i < quantity; i++) {
    const ticketId = uuidv4();
    const item = {
      ticket_id:  ticketId,
      order_id:   orderID,
      user_id:    userID,
      event_id:   event_id,
      status:     'ACTIVE',
      created_at: now,
      qr_code:    ticketId
    };
    created.push(item);
    writes.push({ PutRequest: { Item: item } });
  }

  // 6) Escribir en batch (hasta 25 por lote)
  try {
    while (writes.length) {
      const batch = writes.splice(0, 25);
      await doc.batchWrite({
        RequestItems: { [TICKETS_TABLE]: batch }
      }).promise();
    }
  } catch (ddbBatchError) {
    console.error('DynamoDB BatchWrite error:', ddbBatchError);
    return buildResponse(500, {
      error:   'DynamoDBBatchWriteError',
      message: ddbBatchError.message,
      stack:   ddbBatchError.stack,
      failedItems: writes
    });
  }

  // 7) Responder exitoso
  return buildResponse(201, { tickets: created });
};
