/**
 * Crea tablas DynamoDB de backoffice y suscripciones en us-east-2 (QA).
 * Uso: node scripts/create-qa-tables.js
 */
const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB({ region: 'us-east-2' });

const tables = [
  {
    TableName: 'doevents-backoffice-qa-users',
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'status', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' },
      { AttributeName: 'userId', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'StatusIndex',
        KeySchema: [
          { AttributeName: 'status', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'EmailIndex',
        KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'UserIdIndex',
        KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },
  {
    TableName: 'Subscriptions-qa',
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'reference', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'ReferenceIndex',
        KeySchema: [{ AttributeName: 'reference', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },
];

async function ensureTable(definition) {
  const name = definition.TableName;
  try {
    await dynamodb.describeTable({ TableName: name }).promise();
    console.log(`✓ ${name} ya existe`);
    return;
  } catch (err) {
    if (err.code !== 'ResourceNotFoundException') throw err;
  }
  await dynamodb.createTable(definition).promise();
  console.log(`✓ ${name} creada`);
  await dynamodb.waitFor('tableExists', { TableName: name }).promise();
}

(async () => {
  for (const table of tables) {
    await ensureTable(table);
  }
  console.log('Listo.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
