const {
  getEventInvitations,
  getExecutedBuyerUserIdsByEvent,
  getClientByUserId,
  response,
} = require("./statsShared");
const AWS = require("aws-sdk");

const s3 = new AWS.S3();
const PROFILE_IMAGES_BUCKET = "doeventprofileimagesbucket";

const normalizeChannel = (invitation = {}) => {
  return (
    invitation.channel ||
    invitation.invitationChannel ||
    invitation.deliveryChannel ||
    invitation.via ||
    invitation.source ||
    invitation.originType ||
    "Manual"
  );
};

const normalizeChannelName = (channel) => {
  const normalized = String(channel || "manual").trim().toLowerCase();
  if (normalized === "inapp" || normalized === "in_app") return "In-App Campaign";
  if (normalized === "whatsapp") return "WhatsApp";
  if (normalized === "email" || normalized === "mail") return "Email";
  if (normalized === "push") return "Push";
  return "Manual";
};

const normalizeChannels = (invitation = {}) => {
  if (Array.isArray(invitation.channels) && invitation.channels.length > 0) {
    const dedup = [...new Set(invitation.channels.map((c) => String(c || "").trim()).filter(Boolean))];
    return dedup.length > 0 ? dedup : [normalizeChannel(invitation)];
  }

  return [normalizeChannel(invitation)];
};

const normalizeStatus = (invitation = {}) => {
  return String(invitation.status || invitation.invitationStatus || "pending").toLowerCase();
};

const isDelivered = (invitation = {}) => {
  const deliveryStatus = String(
    invitation.deliveryStatus || invitation.statusDelivery || ""
  ).toLowerCase();

  if (invitation.deliveredAt || invitation.delivered === true || invitation.wasDelivered === true) {
    return true;
  }

  return ["delivered", "sent", "success", "completed"].includes(deliveryStatus);
};

const isOpened = (invitation = {}) =>
  Boolean(invitation.openedAt || invitation.opened || invitation.wasOpened);

const isClicked = (invitation = {}) =>
  Boolean(invitation.clickedAt || invitation.clicked || invitation.wasClicked);

const toArray = (value) => (Array.isArray(value) ? value : []);

const normalizeDeliveryStatus = (value) =>
  String(value || "").trim().toLowerCase();

const isDeliveryConfirmed = (value) =>
  ["delivered", "sent", "success", "completed", "read"].includes(
    normalizeDeliveryStatus(value)
  );

const collectConfirmedDeliveredChannels = (invitation = {}) => {
  const channels = normalizeChannels(invitation).map(normalizeChannelName);
  const confirmed = new Set();

  const statusByChannelCandidates = [
    invitation.channelStatus,
    invitation.channelsStatus,
    invitation.deliveryStatusByChannel,
    invitation.deliveryByChannel,
  ];

  for (const candidate of statusByChannelCandidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    for (const [rawChannel, rawStatus] of Object.entries(candidate)) {
      if (isDeliveryConfirmed(rawStatus)) {
        confirmed.add(normalizeChannelName(rawChannel));
      }
    }
  }

  const deliveredChannelsCandidates = [
    invitation.deliveredChannels,
    invitation.confirmedChannels,
    invitation.sentChannels,
  ];

  for (const candidate of deliveredChannelsCandidates) {
    for (const channel of toArray(candidate)) {
      confirmed.add(normalizeChannelName(channel));
    }
  }

  for (const result of toArray(invitation.channelResults)) {
    if (!result || typeof result !== "object") continue;
    if (!isDeliveryConfirmed(result.status)) continue;
    confirmed.add(normalizeChannelName(result.channel));
  }

  if (confirmed.size === 0 && isDelivered(invitation)) {
    channels.forEach((channel) => confirmed.add(channel));
  }

  return confirmed;
};

const invitedUserId = (invitation = {}) =>
  invitation.userId || invitation.invitedUserId || invitation.targetUserId || null;

const invitedUserEmail = (invitation = {}) =>
  invitation.email || invitation.invitedEmail || invitation.targetEmail || null;

const invitedUserPhone = (invitation = {}) =>
  invitation.phone || invitation.invitedPhone || invitation.targetPhone || null;

const joinFullName = (firstName, lastName) => {
  const fullName = [firstName, lastName]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || null;
};

const invitedUserFirstName = (invitation = {}) =>
  invitation.name ||
  invitation.firstName ||
  invitation.invitedName ||
  invitation.invitedFirstName ||
  invitation.targetName ||
  invitation.targetFirstName ||
  null;

const invitedUserLastName = (invitation = {}) =>
  invitation.lastName ||
  invitation.surname ||
  invitation.invitedLastName ||
  invitation.targetLastName ||
  null;

const invitedUserFullName = (invitation = {}) =>
  invitation.fullName ||
  invitation.invitedFullName ||
  invitation.targetFullName ||
  invitation.userName ||
  invitation.invitedUserName ||
  invitation.targetUserName ||
  joinFullName(invitedUserFirstName(invitation), invitedUserLastName(invitation));

const buildInviteeKey = (invitation = {}, index = 0) =>
  invitedUserId(invitation) ||
  invitedUserEmail(invitation) ||
  invitedUserPhone(invitation) ||
  invitation.id ||
  `invitee-${index}`;

const percentage = (num, den) =>
  den > 0 ? `${((num / den) * 100).toFixed(2)}%` : "0%";

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ""));

const resolveProfileImageUrl = async (rawValue) => {
  const value = String(rawValue || "").trim();
  if (!value) return null;
  if (isHttpUrl(value)) return value;

  try {
    return await s3.getSignedUrlPromise("getObject", {
      Bucket: PROFILE_IMAGES_BUCKET,
      Key: value,
      Expires: 3600,
    });
  } catch (error) {
    console.warn("[getEventInvitationStats] profile image resolve failed:", error.message);
    return value;
  }
};

exports.handler = async (event) => {
  try {
    const { eventId } = event.pathParameters || {};

    if (!eventId) {
      return response(400, { error: "eventId is required" });
    }

    const [invitations, executedBuyerUserIds] = await Promise.all([
      getEventInvitations(eventId),
      getExecutedBuyerUserIdsByEvent(eventId),
    ]);

    const buyerUserIds = new Set(executedBuyerUserIds || []);

    const byChannel = new Map();
    const invitedUsersByChannel = new Map();
    const convertedInvitedUsers = new Set();
    const convertedUsersByChannel = new Map();
    const inviteesMap = new Map();
    let totalDelivered = 0;
    let totalOpened = 0;
    let totalClicked = 0;

    invitations.forEach((invitation, index) => {
      const channels = normalizeChannels(invitation);
      const inviteeUserId = invitedUserId(invitation);
      const isPurchased = Boolean(inviteeUserId && buyerUserIds.has(inviteeUserId));
      const confirmedDeliveredChannels = collectConfirmedDeliveredChannels(invitation);
      const opened = isOpened(invitation);
      const clicked = isClicked(invitation);
      const inviteeKey = buildInviteeKey(invitation, index);

      if (opened) totalOpened += 1;
      if (clicked) totalClicked += 1;

      if (isPurchased && inviteeUserId) {
        convertedInvitedUsers.add(inviteeUserId);
      }

      if (!inviteesMap.has(inviteeKey)) {
        inviteesMap.set(inviteeKey, {
          key: inviteeKey,
          userId: inviteeUserId,
          invitedBy: invitation.invitedBy || invitation.ownerId || invitation.createdBy || null,
          email: invitedUserEmail(invitation),
          phone: invitedUserPhone(invitation),
          nombre: invitedUserFirstName(invitation),
          apellido: invitedUserLastName(invitation),
          nombreCompleto: invitedUserFullName(invitation),
          canales: new Set(),
          canalesEntregados: new Set(),
          totalInvitaciones: 0,
          invitacionesAbiertas: 0,
          invitacionesClickeadas: 0,
          comproBoleta: false,
          ultimaInvitacion: invitation.createdAt || invitation.createDate || invitation.updatedAt || null,
        });
      }

      const inviteeEntry = inviteesMap.get(inviteeKey);
      inviteeEntry.totalInvitaciones += 1;
      inviteeEntry.comproBoleta = inviteeEntry.comproBoleta || isPurchased;
      if (opened) inviteeEntry.invitacionesAbiertas += 1;
      if (clicked) inviteeEntry.invitacionesClickeadas += 1;

      channels.forEach((channel) => {
        const channelName = normalizeChannelName(channel);
        inviteeEntry.canales.add(channelName);
        if (confirmedDeliveredChannels.has(channelName)) {
          inviteeEntry.canalesEntregados.add(channelName);
        }

        if (!byChannel.has(channelName)) {
          byChannel.set(channelName, {
            nombre: channelName,
            enviados: 0,
            delivered: 0,
            opened: 0,
            clicked: 0,
            confirmados: 0,
            conversion: "0%",
            stats: {
              abiertos: 0,
              clickeados: 0,
              confirmados: 0,
            },
          });
        }

        const channelStats = byChannel.get(channelName);
        channelStats.enviados += 1;
        if (confirmedDeliveredChannels.has(channelName)) {
          channelStats.delivered += 1;
          totalDelivered += 1;
        }
  if (opened) channelStats.opened += 1;
  if (clicked) channelStats.clicked += 1;

        if (!invitedUsersByChannel.has(channelName)) {
          invitedUsersByChannel.set(channelName, new Set());
        }
        if (inviteeUserId) {
          invitedUsersByChannel.get(channelName).add(inviteeUserId);
        }

        if (isPurchased) {
          channelStats.confirmados += 1;
          channelStats.stats.confirmados += 1;

          if (!convertedUsersByChannel.has(channelName)) {
            convertedUsersByChannel.set(channelName, new Set());
          }
          if (inviteeUserId) {
            convertedUsersByChannel.get(channelName).add(inviteeUserId);
          }
        }

        if (opened) {
          channelStats.stats.abiertos += 1;
        }
        if (clicked) {
          channelStats.stats.clickeados += 1;
        }
      });
    });

    const channels = Array.from(byChannel.values()).map((channel) => {
      const invitedUsers = invitedUsersByChannel.get(channel.nombre) || new Set();
      const convertedUsers = convertedUsersByChannel.get(channel.nombre) || new Set();
      const conversionBySend = percentage(channel.confirmados, channel.enviados);
      const conversionByUniqueUser = percentage(convertedUsers.size, invitedUsers.size);
      const deliveryRate = percentage(channel.delivered, channel.enviados);
      const openRate = percentage(channel.opened, channel.delivered || channel.enviados);
      const clickRate = percentage(channel.clicked, channel.opened || channel.delivered || channel.enviados);

      return {
        ...channel,
        conversion: conversionBySend,
        delivered: channel.delivered,
        opened: channel.opened,
        clicked: channel.clicked,
        deliveryRate,
        openRate,
        clickRate,
        conversionRate: conversionBySend,
        invitadosUnicos: invitedUsers.size,
        compradoresUnicos: convertedUsers.size,
        efectividadCompradores: conversionByUniqueUser,
      };
    });

    const totalEnviados = invitations.length;
    const totalConfirmations = convertedInvitedUsers.size;
    const deliveryRateAvg = percentage(totalDelivered, totalEnviados);
    const openRateAvg = percentage(totalOpened, totalDelivered || totalEnviados);
    const conversionRateAvg = percentage(totalConfirmations, totalEnviados);

    const compradoresUnicosDetalle = await Promise.all(
      Array.from(buyerUserIds).map(async (userId) => {
        const client = await getClientByUserId(userId);
        const comprador =
          client?.name && client?.lastName
            ? `${client.name} ${client.lastName}`.trim()
            : client?.name || userId;
        const imagenPerfil = await resolveProfileImageUrl(
          client?.fotoPerfilUrl ||
            client?.profileImage ||
            client?.avatar ||
            client?.profile_image ||
            client?.profileImageUrl
        );
        return [comprador, imagenPerfil];
      })
    );

    const invitadosDetalle = await Promise.all(
      Array.from(inviteesMap.values()).map(async (invitee) => {
        const client = invitee.userId
          ? await getClientByUserId(invitee.userId, invitee.invitedBy)
          : null;
        const clientFullName = joinFullName(client?.name, client?.lastName);
        const nombre =
          clientFullName ||
          invitee.nombreCompleto ||
          joinFullName(invitee.nombre, invitee.apellido) ||
          client?.name ||
          invitee.email ||
          invitee.phone ||
          invitee.key;
        const avatar = await resolveProfileImageUrl(
          client?.fotoPerfilUrl ||
            client?.profileImage ||
            client?.avatar ||
            client?.profile_image ||
            client?.profileImageUrl
        );

        return {
          userId: invitee.userId,
          nombre,
          email: client?.email || invitee.email || null,
          phone: client?.phone || invitee.phone || null,
          avatar,
          canales: Array.from(invitee.canales),
          canalesEntregados: Array.from(invitee.canalesEntregados),
          totalInvitaciones: invitee.totalInvitaciones,
          invitacionesAbiertas: invitee.invitacionesAbiertas,
          invitacionesClickeadas: invitee.invitacionesClickeadas,
          comproBoleta: invitee.comproBoleta,
          ultimaInvitacion: invitee.ultimaInvitacion,
        };
      })
    );

    return response(200, {
      eventId,
      totalEnviados,
      invitadosUnicos: inviteesMap.size,
      totalConfirmados: totalConfirmations,
      totalConfirmations,
      compradoresTotales: buyerUserIds.size,
      compradoresUnicosDetalle,
      totalDelivered,
      totalOpened,
      totalClicked,
      deliveryRateAvg,
      openRateAvg,
      conversionRateAvg,
      metodoConfirmacion: "cruce_invited_user_vs_buyer_user",
      metodologiaCanal:
        "atribucion_por_usuario_unico; un usuario puede contar en multiples canales si recibio multiples invitaciones",
      invitadosDetalle,
      canales: channels,
    });
  } catch (error) {
    console.error("getEventInvitationStats error:", error);
    return response(500, {
      error: "Error getting invitation stats",
      message: error.message,
    });
  }
};
