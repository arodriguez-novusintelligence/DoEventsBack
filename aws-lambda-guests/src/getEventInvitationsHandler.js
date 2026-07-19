const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

/**
 * Handler para obtener todas las invitaciones de un evento
 */
exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));

    const { eventId } = event.pathParameters;
    const queryParams = event.queryStringParameters || {};
    const { status } = queryParams; // Filtrar por status: pending, accepted, rejected, expired

    if (!eventId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "eventId is required" }),
      };
    }

    // Consultar todas las invitaciones del evento
    const params = {
      TableName: process.env.EVENT_INVITATIONS_TABLE || "EventInvitations",
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: {
        ":pk": `EVENT#${eventId}`,
      },
    };

    const result = await dynamodb.query(params).promise();

    let invitations = result.Items || [];

    // Filtrar por status si se proporciona
    if (status) {
      invitations = invitations.filter((inv) => inv.status === status);
    }

    // Enriquecer con información de usuarios
    const enrichedInvitations = await Promise.all(
      invitations.map(async (invitation) => {
        try {
          const userData = await dynamodb
            .get({
              TableName: process.env.CLIENT_TABLE || "Client",
              Key: { id: invitation.userId },
            })
            .promise();

          return {
            ...invitation,
            userName: userData.Item
              ? `${userData.Item.name || ""} ${
                  userData.Item.lastName || ""
                }`.trim()
              : "Usuario desconocido",
            userEmail: userData.Item?.email || "",
            userPhone: userData.Item?.phone || "",
          };
        } catch (err) {
          console.error(`Error fetching user ${invitation.userId}:`, err);
          return invitation;
        }
      })
    );

    // Estadísticas
    const stats = {
      total: invitations.length,
      pending: invitations.filter((i) => i.status === "pending").length,
      accepted: invitations.filter((i) => i.status === "accepted").length,
      rejected: invitations.filter((i) => i.status === "rejected").length,
      expired: invitations.filter((i) => i.status === "expired").length,
    };

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        invitations: enrichedInvitations,
        stats,
      }),
    };
  } catch (error) {
    console.error("Error in getEventInvitationsHandler:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};
