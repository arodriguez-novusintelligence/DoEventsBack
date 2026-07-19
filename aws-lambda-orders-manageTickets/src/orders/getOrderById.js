const AWS = require('aws-sdk');
const { buildSuccess, buildError } = require('../helpers/responses');
const { enrichOrderTicketsWithQr } = require('../helpers/qrResolver');

AWS.config.update({ region: process.env.AWS_REGION });

const doc = new AWS.DynamoDB.DocumentClient();
const ORDERS_TABLE = process.env.ORDERS_TABLE;

exports.handler = async (event) => {
  try {
    const orderId = event.pathParameters?.orderId;

    if (!orderId) {
      return buildError('orderId es requerido en la URL', 'MISSING_ORDER_ID');
    }

    const result = await doc.get({
      TableName: ORDERS_TABLE,
      Key: { order_id: orderId },
    }).promise();

    if (!result.Item) {
      return buildError(`Orden ${orderId} no encontrada`, 'ORDER_NOT_FOUND');
    }

    const order = await enrichOrderTicketsWithQr(result.Item);

    return buildSuccess('getOrderById', {
      message: 'Orden obtenida exitosamente',
      order,
    });
  } catch (err) {
    console.error('Error en getOrderById:', err);
    return buildError('Error al obtener la orden', 'GET_ORDER_FAILED', { error: err.message });
  }
};
