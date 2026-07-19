/**
 * Crea la tabla DynamoDB EventPromoCodes-dev (single-table design por evento).
 * Uso: node scripts/create-promo-codes-table.js
 */
const AWS = require('aws-sdk');

const region = process.env.AWS_REGION || process.env.DYNAMODB_REGION || 'sa-east-1';
const tableName = process.env.PROMO_CODES_TABLE || 'EventPromoCodes-dev';

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
        { AttributeName: 'eventId', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'eventId', KeyType: 'HASH' },
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
