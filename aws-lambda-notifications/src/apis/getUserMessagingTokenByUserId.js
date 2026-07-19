const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const fromPath = event.pathParameters && event.pathParameters.userId;
    const fromQuery =
      event.queryStringParameters && event.queryStringParameters.userId;
    const fromBody =
      (event.body && JSON.parse(event.body || "{}").userId) || null;
    const userId = fromPath || fromQuery || fromBody;

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "userId is required" }),
      };
    }

    // BUILD PARAMS
    const params = {
      TableName: process.env.USER_TOKENS_TABLE || "UserTokens",
      KeyConditionExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": userId },
    };

    // GET USER MESSAGING TOKENS
    const result = await docClient.query(params).promise();
    
    // MAP ITEMS TO TOKENS
    const token = result.Items && result.Items.length > 0 ? result.Items[0].token : null;

    // RETURN SUCCESS RESPONSE
    return {
      statusCode: 200,
      body: JSON.stringify({ userId, token }),
    };
  } catch (err) {
    console.error("getUserTokensByUserId error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "internal_error" }),
    };
  }
};
