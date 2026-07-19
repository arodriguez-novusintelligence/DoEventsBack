const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  try {
    const { sectionId } = event.pathParameters;

    // Eliminar asientos de la sección
    const seats = await dynamodb
      .query({
        TableName: "Venue_Seat",
        IndexName: "sectionIdIndex",
        KeyConditionExpression: "sectionId = :sectionId",
        ExpressionAttributeValues: { ":sectionId": sectionId },
      })
      .promise();

    if (seats.Items && seats.Items.length > 0) {
      const batchSize = 25;
      for (let i = 0; i < seats.Items.length; i += batchSize) {
        const batch = seats.Items.slice(i, i + batchSize);
        await dynamodb
          .batchWrite({
            RequestItems: {
              Venue_Seat: batch.map((seat) => ({
                DeleteRequest: { Key: { seatId: seat.seatId } },
              })),
            },
          })
          .promise();
      }
    }

    await dynamodb
      .delete({
        TableName: "Venue_Section",
        Key: { sectionId },
      })
      .promise();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Section and seats deleted successfully",
        sectionId,
      }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};
