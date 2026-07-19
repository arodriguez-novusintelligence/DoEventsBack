const AWS = require('aws-sdk');

const region = process.env.DYNAMODB_REGION || process.env.AWS_REGION || 'us-east-2';
const doc = new AWS.DynamoDB.DocumentClient({ region });

module.exports = { doc, region };
