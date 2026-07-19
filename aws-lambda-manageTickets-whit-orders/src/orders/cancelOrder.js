// src/orders/cancelOrder.js
const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

const ORD_TABLE = process.env.ORDERS_TABLE;

exports.handler = async (event) => {
  const build = (c,b) => ({ statusCode:c, headers:{'Content-Type':'application/json'}, body: JSON.stringify(b) });
  try {
    const { orderID } = JSON.parse(event.body||'{}');
    if (!orderID) return build(400, { error:'MissingParameter', message:'orderID requerido' });
    await doc.update({
      TableName: ORD_TABLE,
      Key: { order_id: orderID },
      UpdateExpression: 'SET #st = :c',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: { ':c': 'CANCELLED' }
    }).promise();
    return build(200, { message:'Orden cancelada' });
  } catch (err) {
    console.error('cancelOrder error:', err);
    return build(500, { error:'InternalError', detail:err.message });
  }
};
