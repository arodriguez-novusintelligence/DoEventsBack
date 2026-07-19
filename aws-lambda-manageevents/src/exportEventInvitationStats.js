const {
  getEventInvitations,
  getExecutedBuyerUserIdsByEvent,
  response,
} = require("./statsShared");

const csvEscape = (value) => {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

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

const invitedUserId = (invitation = {}) =>
  invitation.userId || invitation.invitedUserId || invitation.targetUserId || null;

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

const percentage = (num, den) =>
  den > 0 ? `${((num / den) * 100).toFixed(2)}%` : "0%";

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
    const convertedUsersByChannel = new Map();
    const convertedUsers = new Set();
    let totalDelivered = 0;
    let totalOpened = 0;
    let totalClicked = 0;

    for (const invitation of invitations) {
      const channels = normalizeChannels(invitation);
      const inviteeUserId = invitedUserId(invitation);
      const isPurchased = Boolean(inviteeUserId && buyerUserIds.has(inviteeUserId));
      const delivered = isDelivered(invitation);
      const opened = isOpened(invitation);
      const clicked = isClicked(invitation);

      if (isPurchased && inviteeUserId) {
        convertedUsers.add(inviteeUserId);
      }
      if (delivered) totalDelivered += 1;
      if (opened) totalOpened += 1;
      if (clicked) totalClicked += 1;

      channels.forEach((channelRaw) => {
        const channelName = normalizeChannelName(channelRaw);

        if (!byChannel.has(channelName)) {
          byChannel.set(channelName, {
            nombre: channelName,
            enviados: 0,
            delivered: 0,
            opened: 0,
            clicked: 0,
            confirmados: 0,
          });
        }

        const channel = byChannel.get(channelName);
        channel.enviados += 1;
        if (delivered) channel.delivered += 1;
        if (opened) channel.opened += 1;
        if (clicked) channel.clicked += 1;

        if (!invitedUsersByChannel.has(channelName)) {
          invitedUsersByChannel.set(channelName, new Set());
        }
        if (inviteeUserId) {
          invitedUsersByChannel.get(channelName).add(inviteeUserId);
        }

        if (isPurchased) {
          channel.confirmados += 1;
          if (!convertedUsersByChannel.has(channelName)) {
            convertedUsersByChannel.set(channelName, new Set());
          }
          if (inviteeUserId) {
            convertedUsersByChannel.get(channelName).add(inviteeUserId);
          }
        }
      });
    }

    const rows = [
      [
        "canal",
        "enviados",
        "delivered",
        "opened",
        "clicked",
        "confirmados",
        "conversion",
        "deliveryRate",
        "openRate",
        "clickRate",
        "invitadosUnicos",
        "compradoresUnicos",
        "efectividadCompradores",
      ],
    ];

    for (const channel of byChannel.values()) {
      const conversion = percentage(channel.confirmados, channel.enviados);
      const invitedUsers = invitedUsersByChannel.get(channel.nombre) || new Set();
      const convertedUsers = convertedUsersByChannel.get(channel.nombre) || new Set();
      const effectiveness = percentage(convertedUsers.size, invitedUsers.size);
      const deliveryRate = percentage(channel.delivered, channel.enviados);
      const openRate = percentage(channel.opened, channel.delivered || channel.enviados);
      const clickRate = percentage(channel.clicked, channel.opened || channel.delivered || channel.enviados);

      rows.push([
        channel.nombre,
        channel.enviados,
        channel.delivered,
        channel.opened,
        channel.clicked,
        channel.confirmados,
        conversion,
        deliveryRate,
        openRate,
        clickRate,
        invitedUsers.size,
        convertedUsers.size,
        effectiveness,
      ]);
    }

    const totalEnviados = invitations.length;
    const totalConfirmations = convertedUsers.size;
    const deliveryRateAvg = percentage(totalDelivered, totalEnviados);
    const openRateAvg = percentage(totalOpened, totalDelivered || totalEnviados);
    const conversionRateAvg = percentage(totalConfirmations, totalEnviados);

    rows.push([]);
    rows.push([
      "TOTAL",
      totalEnviados,
      totalDelivered,
      totalOpened,
      totalClicked,
      totalConfirmations,
      conversionRateAvg,
      deliveryRateAvg,
      openRateAvg,
      "",
      "",
      "",
      "",
    ]);

    rows.push([
      "GLOBAL_KPIS",
      "",
      "",
      "",
      "",
      totalConfirmations,
      conversionRateAvg,
      deliveryRateAvg,
      openRateAvg,
      "",
      "",
      "",
      "",
    ]);

    const csvContent = rows.map((row) => row.map(csvEscape).join(",")).join("\n");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Content-Disposition": `attachment; filename=invitation-stats-${eventId}.csv`,
      },
      body: csvContent,
    };
  } catch (error) {
    console.error("exportEventInvitationStats error:", error);
    return response(500, {
      error: "Error exporting invitation stats",
      message: error.message,
    });
  }
};
