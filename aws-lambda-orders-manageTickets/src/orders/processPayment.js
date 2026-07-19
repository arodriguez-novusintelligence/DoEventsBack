// src/orders/processPayment.js
const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });
const doc = new AWS.DynamoDB.DocumentClient();

const ORD_TABLE = process.env.ORDERS_TABLE;

exports.handler = async (event) => {
  const build = (c,b) => ({ statusCode:c, headers:{'Content-Type':'application/json'}, body: JSON.stringify(b) });
  try {
    const { orderID, paymentInfo } = JSON.parse(event.body||'{}');
    if (!orderID || !paymentInfo) {
      return build(400, { error:'MissingParameter', message:'orderID y paymentInfo requeridos' });
    }
    // Aquí iría llamada real a pasarela de pago…
    await doc.update({
      TableName: ORD_TABLE,
      Key: { order_id: orderID },
      UpdateExpression: 'SET #st = :s',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: { ':s': 'PAID' }
    }).promise();
    return build(200, { message:'Pago procesado' });
  } catch (err) {
    console.error('processPayment error:', err);
    return build(500, { error:'InternalError', detail:err.message });
  }
};
