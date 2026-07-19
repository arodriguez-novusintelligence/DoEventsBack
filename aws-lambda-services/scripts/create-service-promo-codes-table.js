/**
 * Crea la tabla DynamoDB ServicePromoCodes-dev (single-table design por serviceId).
 * Uso: node scripts/create-service-promo-codes-table.js
 */
const AWS = require('aws-sdk');

const region = process.env.AWS_REGION || process.env.DYNAMODB_REGION || 'sa-east-1';
const tableName = process.env.SERVICE_PROMO_CODES_TABLE || 'ServicePromoCodes-dev';

const dynamodb = new AWS.DynamoDB({ region });

async function main() {
  try {
    await dynamodb.describeTable({ TableName: tableName }).promise();
    console.log(`La tabla ${tableName} ya existe en ${region}.`);
    return;
  } catch (error) {
    if (error.code !== 'ResourceNotFoundException') throw error;
  }

  await dynamodb
    .createTable({
      TableName: tableName,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'serviceId', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'serviceId', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
    })
    .promise();

  console.log(`Tabla ${tableName} creada en ${region}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
