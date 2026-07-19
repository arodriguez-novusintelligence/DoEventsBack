const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const {
  idsMatch,
  resolveParticipantsDetails,
  findParticipantById,
  filterParticipantsByIds,
} = require("../utils/resolveChatParticipants");
const {
  normalizeAdminIds,
} = require("../utils/chatRoomAdmin");
const {
  resolveRoomUnreadCount,
} = require("../utils/chatUnread");

const CHATS_TABLE = process.env.CHATS_TABLE || "Chats";
const EVENTOS_TABLE = process.env.EVENTOS_TABLE || "Eventos";
const IMAGENES_TABLE = process.env.IMAGENES_TABLE || "imagenes";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Credentials": true,
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  const userId = event.pathParameters.userId;

  if (!userId) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Missing userId" }),
    };
  }

  const chatParams = {
    TableName: CHATS_TABLE,
    FilterExpression:
      "contains(participants, :userId) OR contains(pendingParticipants, :userId) OR contains(administrators, :userId) OR contains(adminId, :userId)",
    ExpressionAttributeValues: {
      ":userId": userId,
    },
  };

  try {
    const chatResult = await dynamodb.scan(chatParams).promise();
    const chats = (chatResult.Items || []).filter((chat) => !chat.deletedAt);

    // Defensive dedupe to avoid repeated rooms when multiple membership fields match.
    const uniqueChats = [];
    const seenChatKeys = new Set();

    chats.forEach((chat) => {
      const chatKey = chat.roomId || chat.id;

      if (!chatKey) {
        uniqueChats.push(chat);
        return;
      }

      if (seenChatKeys.has(chatKey)) {
        return;
      }

      seenChatKeys.add(chatKey);
      uniqueChats.push(chat);
    });

    const enrichedChats = await Promise.all(
      uniqueChats.map(async (chat) => {
        // Marcar tipo de chat explícitamente
        // Soporta target como array (['room::direct'] o ['room::event'])
        const targetArr = Array.isArray(chat.target) ? chat.target : [chat.target];
        if (targetArr.includes("room::direct")) {
          chat.chatType = "direct";
          const pending = Array.isArray(chat.pendingParticipants) ? chat.pendingParticipants : [];
          const participants = Array.isArray(chat.participants) ? chat.participants : [];
          chat.directChatStatus = chat.directChatStatus
            || (pending.length > 0 ? "pending" : "active");
          chat.invitationPending = pending.some((id) => idsMatch(id, userId));
          chat.canMessage = participants.length >= 2 && pending.length === 0;
          if (!chat.roomName && chat.hostName) {
            chat.roomName = chat.invitationPending
              ? `Mensaje de ${chat.hostName}`
              : chat.roomName;
          }
        } else if (targetArr.includes("room::private-group")) {
          chat.chatType = "group";
        } else if (targetArr.includes("room::event")) {
          chat.chatType = "event";
        } else {
          chat.chatType = "unknown";
        }

        const participantIds = Array.isArray(chat.participants) ? chat.participants : [];
        const pendingIds = Array.isArray(chat.pendingParticipants) ? chat.pendingParticipants : [];
        const allMemberIds = [...new Set([...participantIds, ...pendingIds])];
        const resolvedParticipants = await resolveParticipantsDetails(allMemberIds);
        const resolvedPending = filterParticipantsByIds(resolvedParticipants, pendingIds);
        const resolvedActive = filterParticipantsByIds(resolvedParticipants, participantIds);
        chat.pendingParticipantDetails = resolvedPending;
        const admins = normalizeAdminIds(chat);
        chat.isAdmin = admins.some((adminId) => idsMatch(adminId, userId));
        if (chat.chatType === "event") {
          chat.invitationPending = pendingIds.some((id) => idsMatch(id, userId));
          const isParticipant = resolvedActive.some((p) => idsMatch(p.id, userId));
          chat.canMessage = isParticipant && !chat.invitationPending;
        }

        if (chat.chatType === "direct") {
          chat.participants = resolvedParticipants;
          const peerId = allMemberIds.find((id) => !idsMatch(id, userId))
            || (chat.initiatorId && !idsMatch(chat.initiatorId, userId) ? chat.initiatorId : null)
            || (chat.inviteeId && !idsMatch(chat.inviteeId, userId) ? chat.inviteeId : null);
          if (peerId) {
            chat.directPeer = findParticipantById(resolvedParticipants, peerId) || { id: peerId };
          }
          if (!chat.event) {
            delete chat.eventName;
          }
        }

        // IF NO EVENT, RETURN CHAT AS IS
        if (!chat.event) {
          if (chat.chatType !== "direct") {
            if (resolvedActive.length > 0) {
              chat.participants = resolvedActive;
            } else if (resolvedParticipants.length > 0) {
              chat.participants = resolvedParticipants;
            }
          }
          try {
            chat.unreadCount = await resolveRoomUnreadCount(chat, userId);
          } catch (unreadErr) {
            console.error("Error computing unreadCount:", unreadErr);
            chat.unreadCount = 0;
          }
          return chat;
        }

        // FETCH EVENT DETAILS
        const eventParams = {
          TableName: EVENTOS_TABLE,
          Key: { id: chat.event },
        };

        try {
          // GET EVENT DETAILS (sin cargar todo el historial de mensajes: el cliente lo pide al abrir la sala)
          const eventResult = await dynamodb.get(eventParams).promise();

          if (eventResult.Item) {
            chat.event = eventResult.Item;
            const imageEvent = await consultaImagen(eventResult.Item.id);
            chat.event.image = imageEvent;
          }

          chat.participants = resolvedParticipants;
          chat.messages = [];
        } catch (err) {
          console.error("Error enriching chat:", err);
          chat.messages = [];
        }

        try {
          chat.unreadCount = await resolveRoomUnreadCount(chat, userId);
        } catch (unreadErr) {
          console.error("Error computing unreadCount:", unreadErr);
          chat.unreadCount = 0;
        }

        return chat;
      })
    );

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(enrichedChats),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

const consultaImagen = async (event) => {
  let imagen = " ";
  console.log(event + " Inicio consulta imagen");
  const paramsImage = {
    TableName: IMAGENES_TABLE,
    IndexName: "eventIdIndex",
    KeyConditionExpression: "id_evento = :id_evento",
    ExpressionAttributeValues: {
      ":id_evento": event,
    },
  };

  // Ejecutar consulta
  const result = await dynamodb.query(paramsImage).promise();

  if (!result.Items || result.Items.length === 0) {
    return (imagen = " ");
  }
  const Imagenes = result.Items[0].imagenesCargadas;
  if (!Imagenes || Imagenes.length === 0) {
    return (imagen = " ");
  }
  imagen = Imagenes[0];

  const getImageUrl = (bucketName, key) => {
    const params = {
      Bucket: bucketName,
      Key: key,
    };

    // Obtén la URL de la imagen
    return s3.getSignedUrl("getObject", params);
  };

  let key;
  const posicionInicial = imagen.indexOf(".com/");
  if (posicionInicial === -1) {
    key = imagen;
  } else {
    key = imagen.substring(imagen.indexOf(".com/") + 5);
  }
  imagen = getImageUrl("doeventimageeventbucket", key);
  return imagen;
};
