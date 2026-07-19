/**
 * Asigna platformRole=admin a usuarios por email.
 * Uso: node scripts/bootstrap-admins.js
 */
const AWS = require('aws-sdk');

const REGION = process.env.DYNAMODB_REGION || process.env.AWS_REGION || 'sa-east-1';
const CLIENT_TABLE = process.env.CLIENT_TABLE || 'Client-dev';

const ADMIN_EMAILS = [
  'arodriguez5288@gmail.com',
];

const dynamodb = new AWS.DynamoDB.DocumentClient({ region: REGION });

async function findUsersByEmail(email) {
  const result = await dynamodb.query({
    TableName: CLIENT_TABLE,
    IndexName: 'EmailIndex',
    KeyConditionExpression: 'email = :email',
    ExpressionAttributeValues: { ':email': email },
  }).promise();
  return result.Items || [];
}

async function promoteToAdmin(user) {
  await dynamodb.update({
    TableName: CLIENT_TABLE,
    Key: { id: user.id },
    UpdateExpression: 'SET platformRole = :admin, #plan = :pro, updatedAt = :now',
    ExpressionAttributeNames: { '#plan': 'plan' },
    ExpressionAttributeValues: {
      ':admin': 'admin',
      ':pro': 'pro',
      ':now': new Date().toISOString(),
    },
  }).promise();
}

(async () => {
  for (const email of ADMIN_EMAILS) {
    const users = await findUsersByEmail(email);
    if (!users.length) {
      console.warn(`⚠ No se encontró usuario con email ${email}`);
      continue;
    }
    for (const user of users) {
      await promoteToAdmin(user);
      console.log(`✓ ${email} (${user.id}) → platformRole=admin`);
    }
  }
  console.log('Listo.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
