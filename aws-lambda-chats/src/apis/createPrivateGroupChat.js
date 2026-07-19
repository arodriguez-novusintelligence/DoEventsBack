const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");
const { parseLambdaJsonBody } = require("../utils/parseLambdaJsonBody");
const { jsonResponse, optionsResponse } = require("../utils/corsHttp");
const { getClientByUserId } = require("../utils/clientUserLookup");
const { resolveProfileAvatarUrl } = require("../utils/profileAvatarUrl");

const CHATS_TABLE = process.env.CHATS_TABLE || "Chats";
const docClient = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

function resolveDisplayName(userData) {
  return (
    userData?.user
    || userData?.name
    || [userData?.firstName, userData?.lastName].filter(Boolean).join(" ")
    || userData?.nombre
    || userData?.email
    || "Usuario"
  );
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return optionsResponse();

  try {
    const body = parseLambdaJsonBody(event);
    const creatorId = String(body.creatorId || body.userId || "").trim();
    const groupName = String(body.groupName || "").trim();
    const memberIds = Array.isArray(body.memberIds)
      ? body.memberIds.map((id) => String(id).trim()).filter(Boolean)
      : [];

    if (!creatorId || !groupName) {
      return jsonResponse(400, { error: "creatorId y groupName son obligatorios" });
    }

    const uniqueMembers = [...new Set([creatorId, ...memberIds])];
    if (uniqueMembers.length < 2) {
      return jsonResponse(400, { error: "Un grupo privado requiere al menos 2 participantes" });
    }

    const users = await Promise.all(uniqueMembers.map((id) => getClientByUserId(id)));
    if (users.some((user) => !user)) {
      return jsonResponse(404, { error: "Uno o más participantes no existen" });
    }

    const resolvedIds = users.map((user) => String(user.id || "").trim()).filter(Boolean);
    const participants = await Promise.all(
      users.map(async (user) => ({
        id: String(user.id || "").trim(),
        name: resolveDisplayName(user),
        avatar: resolveProfileAvatarUrl(s3, user.fotoPerfilUrl, user.platform),
      })),
    );

    const nowIso = new Date().toISOString();
    const roomId = `private_group_${uuidv4()}`;
    const room = {
      id: roomId,
      roomId,
      target: ["room::private-group"],
      chatType: "group",
      roomName: groupName,
      participants: resolvedIds,
      participantDetails: participants,
      administrators: [creatorId],
      adminId: [creatorId],
      initiatorId: creatorId,
      directChatStatus: "active",
      canMessage: true,
      invitationPending: false,
      pendingParticipants: [],
      archivedBy: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    };

    await docClient.put({ TableName: CHATS_TABLE, Item: room }).promise();

    return jsonResponse(201, {
      room: {
        ...room,
        participants,
      },
      created: true,
    });
  } catch (error) {
    console.error("createPrivateGroupChat:", error);
    return jsonResponse(500, { error: error.message || "Internal server error" });
  }
};
