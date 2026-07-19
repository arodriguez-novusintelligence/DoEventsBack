const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require("uuid");

exports.handler = async (event) => {
  try {
    const { venueId, categoryId, sectionId } = event.pathParameters;
    const body = JSON.parse(event.body);

    if (!sectionId || !categoryId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "sectionId and categoryId are required",
        }),
      };
    }

    if (!body.name) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "name is required" }),
      };
    }

    const newSectionId = uuidv4();

    const section = {
      sectionId: newSectionId,
      categoryId,
      venueId,
      name: body.name,
      position: body.position || "",
      rows: body.rows || 0,
      seatsPerRow: body.seatsPerRow || 0,
      capacity: body.capacity || 0,
      sortOrder: body.sortOrder || 0,
    };

    await dynamodb
      .put({
        TableName: "Venue_Section",
        Item: section,
      })
      .promise();

    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Section created successfully",
        section,
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
