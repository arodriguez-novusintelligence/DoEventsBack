const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

const {
  resolveParticipantsDetails,
  filterParticipantsByIds,
} = require("../utils/resolveChatParticipants");
const { resolveEventCoverImage } = require("../utils/eventCoverImage");

const CHATS_TABLE = process.env.CHATS_TABLE || "Chats";
const EVENTOS_TABLE = process.env.EVENTOS_TABLE || "Eventos";
// DEV: resolve participants + pending for organizer attendee list.

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Credentials": true,
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  const eventId = event.pathParameters && event.pathParameters.eventId;

  if (!eventId) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: "Missing eventId in URL path." }),
    };
  }

  const params = {
    TableName: CHATS_TABLE,
    IndexName: "event-index",
    KeyConditionExpression: "event = :event",
    ExpressionAttributeValues: {
      ":event": eventId,
    },
  };

  try {
    const result = await dynamodb.query(params).promise();
    const roomData = result.Items.length > 0 ? result.Items[0] : null;

    if (!roomData) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: "Chat room not found for event." }),
      };
    }

    const participantIds = Array.isArray(roomData.participants)
      ? roomData.participants
      : [];
    const pendingIds = Array.isArray(roomData.pendingParticipants)
      ? roomData.pendingParticipants
      : [];
    const adminIds = [
      ...(Array.isArray(roomData.adminId) ? roomData.adminId : roomData.adminId ? [roomData.adminId] : []),
      ...(Array.isArray(roomData.administrators) ? roomData.administrators : []),
    ].map((id) => String(id).trim()).filter(Boolean);

    const allMemberIds = [...new Set([
      ...participantIds,
      ...pendingIds,
      ...adminIds,
    ].map((id) => (typeof id === "string" ? id : id?.id)).filter(Boolean))];

    const resolvedParticipants = await resolveParticipantsDetails(allMemberIds);
    const pendingParticipantDetails = filterParticipantsByIds(
      resolvedParticipants,
      pendingIds,
    );

    let eventName = roomData.eventName || "";
    let eventImage = "";
    try {
      const eventResult = await dynamodb
        .get({
          TableName: EVENTOS_TABLE,
          Key: { id: roomData.event || eventId },
        })
        .promise();
      if (eventResult.Item) {
        eventName = eventResult.Item.nombre || eventResult.Item.name || eventName;
        eventImage = await resolveEventCoverImage(eventResult.Item.id || eventId);
      }
    } catch (eventErr) {
      console.warn("No se pudo enriquecer evento del chat:", eventErr.message);
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ...roomData,
        chatType: "event",
        eventId: roomData.event || eventId,
        eventName,
        eventImage,
        event: {
          id: roomData.event || eventId,
          nombre: eventName,
          name: eventName,
          image: eventImage,
        },
        participants: resolvedParticipants,
        pendingParticipants: pendingIds,
        pendingParticipantDetails,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: "Failed to retrieve room for event.",
        error: error.message,
      }),
    };
  }
};
