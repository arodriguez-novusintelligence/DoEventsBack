const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || 'sa-east-1',
});

const BACKOFFICE_TABLE = process.env.BACKOFFICE_TABLE || 'doevents-backoffice-dev-users';

async function listDisbursements() {
  const items = [];
  let lastKey;
  do {
    const result = await dynamodb.scan({
      TableName: BACKOFFICE_TABLE,
      FilterExpression: 'begins_with(PK, :prefix)',
      ExpressionAttributeValues: { ':prefix': 'DISBURSEMENT#' },
      ExclusiveStartKey: lastKey,
    }).promise();
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  const disbursements = items
    .filter((item) => item.SK === 'META')
    .map((item) => ({
      id: item.id || item.PK.replace('DISBURSEMENT#', ''),
      fileName: item.fileName,
      uploadedAt: item.uploadedAt,
      totalRecords: Number(item.totalRecords || 0),
      totalAmount: Number(item.totalAmount || 0),
      status: item.status || 'cargado',
      uploadedBy: item.uploadedBy || null,
    }))
    .sort((a, b) => String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || '')));

  return disbursements;
}

async function createDisbursement(body, adminId) {
  const fileName = String(body.fileName || '').trim();
  if (!fileName) {
    const err = new Error('BAD_REQUEST');
    err.message = 'fileName es requerido';
    throw err;
  }

  const totalRecords = Math.max(0, Number(body.totalRecords || 0));
  const totalAmount = Math.max(0, Number(body.totalAmount || 0));
  const id = `DSB-${Date.now().toString(36).toUpperCase()}`;
  const uploadedAt = new Date().toISOString();

  const item = {
    PK: `DISBURSEMENT#${id}`,
    SK: 'META',
    id,
    fileName,
    uploadedAt,
    totalRecords,
    totalAmount,
    status: body.status || 'cargado',
    uploadedBy: adminId,
    rows: Array.isArray(body.rows) ? body.rows.slice(0, 500) : [],
  };

  await dynamodb.put({ TableName: BACKOFFICE_TABLE, Item: item }).promise();

  return {
    id,
    fileName,
    uploadedAt,
    totalRecords,
    totalAmount,
    status: item.status,
    uploadedBy: adminId,
  };
}

module.exports = {
  listDisbursements,
  createDisbursement,
};
