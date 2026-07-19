const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { triggerNotification } = require("./notificationUtils");

const EVENTS_TABLE = process.env.EVENTS_TABLE || "Eventos-qa";
const CLIENT_TABLE = process.env.CLIENT_TABLE || "Client-qa";

/**
 * Handler para actualizar el estado de una invitación
 * Estados: pending, accepted, rejected, expired
 */
exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));

    const { eventId, invitationId } = event.pathParameters;
    const body = JSON.parse(event.body);
    const { status, userId } = body;

    // Validaciones
    if (!eventId || !invitationId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "eventId and invitationId are required",
        }),
      };
    }

    if (
      !status ||
      !["pending", "accepted", "rejected", "expired"].includes(status)
    ) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error:
            "Invalid status. Must be: pending, accepted, rejected, or expired",
        }),
      };
    }

    // Buscar la invitación
    const queryParams = {
      TableName: process.env.EVENT_INVITATIONS_TABLE || "EventInvitations",
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": `EVENT#${eventId}`,
        ":sk": userId ? `USER#${userId}#${invitationId}` : `USER#`,
      },
    };

    const result = await dynamodb.query(queryParams).promise();

    if (!result.Items || result.Items.length === 0) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invitation not found" }),
      };
    }

    const invitation = result.Items[0];

    // Actualizar el estado
    const updateParams = {
      TableName: process.env.EVENT_INVITATIONS_TABLE || "EventInvitations",
      Key: {
        PK: invitation.PK,
        SK: invitation.SK,
      },
      UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": status,
        ":updatedAt": new Date().toISOString(),
      },
      ReturnValues: "ALL_NEW",
    };

    const updateResult = await dynamodb.update(updateParams).promise();

    // Si la invitación fue aceptada, agregar al usuario a EventGuests
    if (status === "accepted" && invitation.userId) {
      const guestParams = {
        TableName: process.env.EVENT_GUESTS_TABLE || "EventGuests",
        Item: {
          PK: `EVENT#${eventId}`,
          SK: `GUEST#${invitation.userId}`,
          guestId: invitation.userId,
          eventId: eventId,
          userId: invitation.userId,
          invitedBy: invitation.invitedBy,
          invitationId: invitationId,
          status: "confirmed",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      // Usar put con ConditionExpression para evitar duplicados
      try {
        await dynamodb
          .put({
            ...guestParams,
            ConditionExpression: "attribute_not_exists(PK)",
          })
          .promise();
      } catch (err) {
        if (err.code !== "ConditionalCheckFailedException") {
          throw err;
        }
        // Ya existe, no hacer nada
      }
    }

    if ((status === "accepted" || status === "rejected") && invitation.invitedBy) {
      let eventName = "tu evento";
      let guestName = "Un invitado";
      try {
        const [eventRes, guestRes] = await Promise.all([
          dynamodb.get({ TableName: EVENTS_TABLE, Key: { id: eventId } }).promise(),
          invitation.userId
            ? dynamodb.get({ TableName: CLIENT_TABLE, Key: { id: invitation.userId } }).promise()
            : Promise.resolve({ Item: null }),
        ]);
        eventName = eventRes.Item?.nombre || eventName;
        const guest = guestRes.Item;
        guestName =
          [guest?.nombre, guest?.apellido].filter(Boolean).join(" ").trim() ||
          guest?.username ||
          guestName;
      } catch {
        /* ignore lookup errors */
      }

      const templateKey =
        status === "accepted"
          ? "EVENT_INVITATION_ACCEPTED"
          : "EVENT_INVITATION_REJECTED";

      await triggerNotification({
        templateKey,
        userId: invitation.invitedBy,
        channels: ["push", "inApp", "email", "whatsapp"],
        metadata: {
          eventId,
          eventName,
          guestUserId: invitation.userId,
          guestName,
          invitationId,
        },
      });
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: "Invitation status updated successfully",
        invitation: updateResult.Attributes,
      }),
    };
  } catch (error) {
    console.error("Error in updateInvitationStatusHandler:", error);
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
