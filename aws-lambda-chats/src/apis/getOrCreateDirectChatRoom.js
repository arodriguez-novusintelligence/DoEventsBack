// Endpoint para obtener o crear una sala 1:1 (direct) entre dos usuarios.
// Flujo con invitación: solo si el destino tiene perfil privado y el solicitante no lo sigue (aceptado).
// Perfil público o seguimiento aceptado → sala activa de inmediato, sin invitación.

const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const { getClientByUserId } = require("../utils/clientUserLookup");
const { canOpenDirectChatWithoutInvite } = require("../utils/directChatAccess");
const {
  participantFromClient,
  resolveDisplayName,
  resolveParticipantsDetails,
  findParticipantById,
} = require("../utils/resolveChatParticipants");
const {
  invokeTriggerNotification,
  CHAT_INVITE_ALL_CHANNELS,
} = require("../utils/invokeNotificationsLambda");

const CHATS_TABLE = process.env.CHATS_TABLE || "Chats";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,POST",
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

function getDirectRoomId(userA, userB) {
  const [id1, id2] = [String(userA).trim(), String(userB).trim()].sort();
  return `direct_${id1}_${id2}`;
}

function sortByCreatedAtAsc(a, b) {
  const at = new Date(a?.createdAt || 0).getTime();
  const bt = new Date(b?.createdAt || 0).getTime();
  return at - bt;
}

function buildRoomStatus(room, requesterId, targetId) {
  const participants = Array.isArray(room.participants) ? room.participants : [];
  const pending = Array.isArray(room.pendingParticipants) ? room.pendingParticipants : [];
  const requesterJoined = participants.includes(requesterId);
  const targetJoined = participants.includes(targetId);

  if (requesterJoined && targetJoined) {
    return { status: "active", canMessage: true, invitationPending: false };
  }

  if (room.directChatStatus === "pending" || pending.includes(targetId)) {
    return {
      status: "pending",
      canMessage: requesterJoined && !targetJoined ? false : targetJoined,
      invitationPending: !targetJoined,
    };
  }

  // Salas legacy con ambos participantes
  if (participants.length >= 2) {
    return { status: "active", canMessage: true, invitationPending: false };
  }

  return { status: "pending", canMessage: false, invitationPending: true };
}

async function getActiveDirectRoomsByRoomId(roomId) {
  const roomResult = await dynamodb
    .query({
      TableName: CHATS_TABLE,
      IndexName: "roomId-index",
      KeyConditionExpression: "roomId = :roomId",
      ExpressionAttributeValues: { ":roomId": roomId },
    })
    .promise();
  return (roomResult.Items || []).filter((room) => !room.deletedAt);
}

async function softDeleteDuplicateRooms(rooms, canonicalRoom) {
  const duplicates = rooms.filter(
    (room) => !(room.id === canonicalRoom.id && room.updatedAt === canonicalRoom.updatedAt),
  );
  if (duplicates.length === 0) return;

  const deletedAt = new Date().toISOString();
  await Promise.all(
    duplicates.map(async (room) => {
      if (!room?.id || !room?.updatedAt) return;
      await dynamodb
        .update({
          TableName: CHATS_TABLE,
          Key: { id: room.id, updatedAt: room.updatedAt },
          UpdateExpression: "SET deletedAt = :deletedAt",
          ExpressionAttributeValues: { ":deletedAt": deletedAt },
        })
        .promise();
    }),
  );
}

async function activateDirectRoom(room, requesterId, targetId) {
  const nowIso = new Date().toISOString();
  const participantIds = [...new Set([
    ...(Array.isArray(room.participants) ? room.participants : []),
    requesterId,
    targetId,
  ].map((id) => String(id || "").trim()).filter(Boolean))];

  await dynamodb
    .update({
      TableName: CHATS_TABLE,
      Key: { id: room.id, updatedAt: room.updatedAt },
      UpdateExpression:
        "SET participants = :participants, pendingParticipants = :pending, directChatStatus = :status, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":participants": participantIds,
        ":pending": [],
        ":status": "active",
        ":updatedAt": nowIso,
      },
    })
    .promise();

  return {
    ...room,
    participants: participantIds,
    pendingParticipants: [],
    directChatStatus: "active",
    updatedAt: nowIso,
  };
}

async function notifyDirectChatInvite({ inviteeId, inviteeName, inviterName, roomId }) {
  await invokeTriggerNotification({
    templateKey: "CHAT_USER_INVITE_SEND",
    channels: CHAT_INVITE_ALL_CHANNELS,
    metadata: {
      userId: inviteeId,
      userName: inviteeName,
      eventName: inviterName,
      invitedBy: inviterName,
      link: roomId,
      roomId,
      route: `/chat?roomId=${encodeURIComponent(roomId)}&invite=1`,
      status: "active",
      inviteStatus: "invitation-pending",
      type: "chat-room-invitation",
      chatType: "direct",
    },
  });
}

async function enrichDirectRoom(room, requesterId, targetId, requesterData, targetData) {
  const requesterParticipant = participantFromClient(requesterData);
  const targetParticipant = participantFromClient(targetData);
  const participantIds = Array.isArray(room.participants) ? room.participants : [];
  const pendingIds = Array.isArray(room.pendingParticipants) ? room.pendingParticipants : [];
  const allIds = [...new Set([...participantIds, ...pendingIds].map((id) => String(id || "").trim()).filter(Boolean))];
  const resolvedParticipants = allIds.length
    ? await resolveParticipantsDetails(allIds)
    : [requesterParticipant, targetParticipant].filter(Boolean);

  const peerForRequester = findParticipantById(resolvedParticipants, targetId) || targetParticipant;
  const peerForInvitee = findParticipantById(resolvedParticipants, requesterId) || requesterParticipant;

  return {
    ...room,
    participants: resolvedParticipants,
    pendingParticipants: pendingIds,
    directPeer: peerForRequester,
    requesterPeer: peerForRequester,
    inviteePeer: peerForInvitee,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    const { userA, userB } = body || {};
    if (!userA || !userB) {
      return respond(400, { message: "userA y userB son requeridos" });
    }

    const normalizedUserA = String(userA).trim();
    const normalizedUserB = String(userB).trim();

    if (!normalizedUserA || !normalizedUserB) {
      return respond(400, { message: "userA y userB son requeridos" });
    }

    if (normalizedUserA === normalizedUserB) {
      return respond(400, { message: "No se puede crear chat directo con el mismo usuario" });
    }

    const [userAData, userBData] = await Promise.all([
      getClientByUserId(normalizedUserA),
      getClientByUserId(normalizedUserB),
    ]);

    if (!userAData || !userBData) {
      return respond(404, {
        message: "Uno o ambos usuarios no existen en Client (usa id de 10 caracteres o UUID completo)",
      });
    }

    const resolvedUserA = String(userAData.id || "").trim();
    const resolvedUserB = String(userBData.id || "").trim();

    if (!resolvedUserA || !resolvedUserB) {
      return respond(400, { message: "No se pudo resolver id de uno o ambos usuarios" });
    }

    const requesterId = resolvedUserA;
    const targetId = resolvedUserB;
    const requesterName = resolveDisplayName(userAData);
    const targetName = resolveDisplayName(userBData);
    const roomId = getDirectRoomId(resolvedUserA, resolvedUserB);
    const skipInvite = await canOpenDirectChatWithoutInvite(requesterId, targetId, userBData);

    const existingRooms = await getActiveDirectRoomsByRoomId(roomId);
    let existingRoom = existingRooms.sort(sortByCreatedAtAsc)[0] || null;

    if (existingRoom && skipInvite) {
      const roomStatus = buildRoomStatus(existingRoom, requesterId, targetId);
      if (roomStatus.status === "pending") {
        existingRoom = await activateDirectRoom(existingRoom, requesterId, targetId);
      }
    }

    if (existingRoom) {
      const roomStatus = buildRoomStatus(existingRoom, requesterId, targetId);
      const enrichedRoom = await enrichDirectRoom(
        existingRoom,
        requesterId,
        targetId,
        userAData,
        userBData,
      );

      if (!skipInvite && roomStatus.status === "pending" && roomStatus.invitationPending) {
        try {
          await notifyDirectChatInvite({
            inviteeId: targetId,
            inviteeName: targetName,
            inviterName: requesterName,
            roomId,
          });
        } catch (notifyErr) {
          console.error("getOrCreateDirectChatRoom: error al re-notificar invitación", notifyErr);
        }
      }

      return respond(200, {
        room: enrichedRoom,
        created: false,
        ...roomStatus,
      });
    }

    const nowIso = new Date().toISOString();
    const newRoom = skipInvite
      ? {
        id: roomId,
        roomId,
        target: ["room::direct"],
        participants: [requesterId, targetId],
        pendingParticipants: [],
        directChatStatus: "active",
        initiatorId: requesterId,
        inviteeId: targetId,
        hostName: requesterName,
        roomName: `Chat con ${targetName}`,
        administrators: [],
        adminId: [],
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
      }
      : {
        id: roomId,
        roomId,
        target: ["room::direct"],
        participants: [requesterId],
        pendingParticipants: [targetId],
        directChatStatus: "pending",
        initiatorId: requesterId,
        inviteeId: targetId,
        hostName: requesterName,
        roomName: `Chat con ${targetName}`,
        administrators: [],
        adminId: [],
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
      };

    await dynamodb.put({ TableName: CHATS_TABLE, Item: newRoom }).promise();

    const activeRooms = await getActiveDirectRoomsByRoomId(roomId);
    const canonicalRoom = activeRooms.sort(sortByCreatedAtAsc)[0] || newRoom;
    await softDeleteDuplicateRooms(activeRooms, canonicalRoom);

    if (!skipInvite) {
      try {
        await notifyDirectChatInvite({
          inviteeId: targetId,
          inviteeName: targetName,
          inviterName: requesterName,
          roomId,
        });
      } catch (notifyErr) {
        console.error("getOrCreateDirectChatRoom: error al notificar invitación", notifyErr);
      }
    }

    const enrichedRoom = await enrichDirectRoom(
      canonicalRoom,
      requesterId,
      targetId,
      userAData,
      userBData,
    );

    const createdStatus = skipInvite
      ? { status: "active", canMessage: true, invitationPending: false }
      : { status: "pending", canMessage: false, invitationPending: true };

    return respond(201, {
      room: enrichedRoom,
      created: true,
      ...createdStatus,
    });
  } catch (err) {
    return respond(500, { message: "Error interno", error: err.message });
  }
};
