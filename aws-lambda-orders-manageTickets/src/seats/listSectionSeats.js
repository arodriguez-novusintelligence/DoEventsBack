// src/seats/listSectionSeats.js
const AWS = require('aws-sdk');
const doc = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const { eventId, section } = event.pathParameters;

    if (!eventId || !section) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Falta eventId o section' })
      };
    }

    // Usamos alias para 'section'
    const params = {
      TableName: process.env.SEATS_TABLE,
      IndexName: 'event_id-section-index',
      KeyConditionExpression: 'event_id = :eid AND #sec = :sec',
      ExpressionAttributeNames: {
        '#sec': 'section'
      },
      ExpressionAttributeValues: {
        ':eid': eventId,
        ':sec': section
      }
    };

    const result = await doc.query(params).promise();

    return {
      statusCode: 200,
      body: JSON.stringify(result.Items)
    };

  } catch (err) {
    console.error('Error listando sillas por sección', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'InternalError', detail: err.message })
    };
  }
};
