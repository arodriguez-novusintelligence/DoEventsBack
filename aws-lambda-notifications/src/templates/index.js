function truncate(value, maxLength = 120) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

const WEB_APP_BASE_URL = require("../utils/resolveWebAppBaseUrl").resolveWebAppBaseUrl();
const EVENT_DETAIL_BASE_URL = `${WEB_APP_BASE_URL}/events`;
const DEFAULT_EVENT_IMAGE =
  "https://doeventsapp.com/static/media/phones-slider-4.297ae49fb60d854dc4a3.png";

function formatEventDate(dateStr) {
  const normalized = String(dateStr || "").trim();
  if (/^\d{8}$/.test(normalized)) {
    return `${normalized.substring(6, 8)}/${normalized.substring(4, 6)}/${normalized.substring(0, 4)}`;
  }
  return normalized;
}

function buildEventDetailLink(metadata = {}) {
  if (metadata.eventId) {
    return `${EVENT_DETAIL_BASE_URL}/${metadata.eventId}`;
  }
  if (metadata.link && String(metadata.link).includes("/events/")) {
    return metadata.link;
  }
  return metadata.link || WEB_APP_BASE_URL;
}

function buildEventTimeRange(metadata = {}) {
  const start = String(metadata.eventStartTime || metadata.startTime || "").trim();
  const end = String(metadata.eventEndTime || metadata.endTime || "").trim();

  if (start && end) return `De ${start} a ${end}`;
  if (start) return `Desde ${start}`;
  if (end) return `Hasta ${end}`;
  return "Horario por confirmar";
}

function buildEventLocation(metadata = {}) {
  return (
    metadata.eventLocation ||
    metadata.venueName ||
    metadata.eventVenueName ||
    metadata.eventCity ||
    metadata.city ||
    "Ubicación por confirmar"
  );
}

function buildEventAddress(metadata = {}) {
  return (
    metadata.eventAddress ||
    metadata.address ||
    metadata.eventVenueAddress ||
    metadata.eventCity ||
    metadata.city ||
    ""
  );
}

function buildLifecyclePayload(metadata = {}, type, overrides = {}) {
  const eventLink = buildEventDetailLink(metadata);
  const eventDateDisplay = formatEventDate(metadata.eventDate || metadata.eventEndDate || metadata.eventStartDate);
  const eventTimeRange = buildEventTimeRange(metadata);
  const eventLocation = buildEventLocation(metadata);
  const eventAddress = buildEventAddress(metadata);
  const eventImage = metadata.eventImage || DEFAULT_EVENT_IMAGE;

  const shared = {
    userId: metadata.userId,
    eventId: metadata.eventId,
    eventName: metadata.eventName,
    eventSlug: metadata.eventSlug,
    eventImage,
    link: eventLink,
    eventDate: metadata.eventDate,
    eventDateDisplay,
    eventStartTime: metadata.eventStartTime || "",
    eventEndTime: metadata.eventEndTime || "",
    eventTimeRange,
    eventLocation,
    eventAddress,
    eventCity: metadata.eventCity || metadata.city || "",
    venueName: metadata.venueName || metadata.eventVenueName || "",
    notificationTimestamp: metadata.notificationTimestamp,
    type,
    route: `event-detail:${metadata.eventId || ""}`,
    entityType: "event",
    entityId: metadata.eventId,
    ...overrides,
  };

  return {
    eventLink,
    eventDateDisplay,
    eventTimeRange,
    eventLocation,
    eventAddress,
    eventImage,
    shared,
  };
}

function buildTicketSalesPayload(metadata = {}, type, overrides = {}) {
  const eventLink = buildEventDetailLink(metadata);
  const eventLocation = buildEventLocation(metadata);
  const eventAddress = buildEventAddress(metadata);
  const eventImage = metadata.eventImage || DEFAULT_EVENT_IMAGE;
  const saleStartDateDisplay = formatEventDate(metadata.saleStartDate || metadata.saleStartDateDisplay);
  const saleEndDateDisplay = formatEventDate(metadata.saleEndDate || metadata.saleEndDateDisplay);
  const saleStartTime = String(metadata.saleStartTime || "").trim();
  const saleEndTime = String(metadata.saleEndTime || "").trim();
  const saleCountdownText = String(metadata.saleCountdownText || "").trim();

  const shared = {
    userId: metadata.userId,
    eventId: metadata.eventId,
    eventName: metadata.eventName,
    eventSlug: metadata.eventSlug,
    eventImage,
    link: eventLink,
    eventLocation,
    eventAddress,
    eventCity: metadata.eventCity || metadata.city || "",
    venueName: metadata.venueName || metadata.eventVenueName || "",
    saleStartDate: metadata.saleStartDate || "",
    saleEndDate: metadata.saleEndDate || "",
    saleStartDateDisplay,
    saleEndDateDisplay,
    saleStartTime,
    saleEndTime,
    saleCountdownText,
    ticketSalesWindowDisplay:
      metadata.saleWindowDisplay ||
      [saleStartDateDisplay, saleStartTime, saleEndDateDisplay, saleEndTime]
        .filter(Boolean)
        .join(" | "),
    notificationTimestamp: metadata.notificationTimestamp,
    type,
    route: `event-detail:${metadata.eventId || ""}`,
    entityType: "event",
    entityId: metadata.eventId,
    ...overrides,
  };

  return {
    eventLink,
    eventLocation,
    eventAddress,
    eventImage,
    saleStartDateDisplay,
    saleEndDateDisplay,
    saleStartTime,
    saleEndTime,
    saleCountdownText,
    shared,
  };
}

function buildTicketSalesRecommendationItems(kind) {
  const recommendationsByKind = {
    reminder_owner: [
      "Verifica que el material promocional y el detalle del evento estén actualizados.",
      "Confirma precios, cupos y horarios antes del inicio de la venta.",
      "Monitorea favoritos y seguidores para preparar la salida comercial.",
    ],
    reminder_audience: [
      "Activa recordatorios para no perder la apertura de ventas.",
      "Revisa disponibilidad, ubicación y condiciones del evento.",
      "Confirma tu método de pago antes del inicio de la venta.",
    ],
    started_owner: [
      "Monitorea el comportamiento de ventas desde el detalle del evento.",
      "Verifica cupos disponibles y canales de promoción activos.",
      "Haz seguimiento a la conversión de favoritos y seguidores.",
    ],
    started_audience: [
      "Las entradas ya están disponibles para compra.",
      "Revisa ubicación, horario y tipos de ticket antes de comprar.",
      "Si el evento te interesa, completa tu compra cuanto antes.",
    ],
    ending_soon_owner: [
      "Haz un último empuje promocional antes del cierre de ventas.",
      "Revisa capacidad restante y demanda en tiempo real.",
      "Confirma que el detalle del evento no tenga cambios pendientes.",
    ],
    ending_soon_audience: [
      "Queda poco tiempo para completar tu compra.",
      "Valida disponibilidad y método de pago antes del cierre.",
      "Si asistirás, esta es tu última ventana para asegurar tu entrada.",
    ],
    finished_owner: [
      "Revisa el resumen de ventas enviado a tu correo.",
      "Valida cupos vendidos y estados de órdenes antes del evento.",
      "Prepara la operación de acceso y atención a asistentes.",
    ],
    finished_audience: [
      "La venta de tickets ya terminó para este evento.",
      "Consulta el detalle del evento para validar cualquier actualización.",
      "Si ya compraste, conserva tu orden y ticket para el acceso.",
    ],
    summary_owner: [
      "Usa este resumen para validar el rendimiento comercial del evento.",
      "Contrasta ingresos y tickets vendidos con tu capacidad planeada.",
      "Si necesitas ajustes, hazlos antes del inicio operativo del evento.",
    ],
  };

  return recommendationsByKind[kind] || [];
}

function buildTicketSalesNotificationContent({
  metadata,
  shared,
  eventLink,
  eventLocation,
  eventAddress,
  eventImage,
  title,
  inAppTitle,
  emailSubject,
  emailTitle,
  badgeLabel,
  headerTitle,
  introText,
  pushBody,
  inAppBody,
  eventDateDisplay,
  eventTimeRange,
  detailsSectionTitle,
  dateLabel,
  timeLabel,
  locationLabel,
  recommendationItems,
}) {
  return {
    push: {
      title,
      body: pushBody,
      data: {
        ...shared,
        screen: "event_detail",
      },
      metadata: {
        ...metadata,
        ...shared,
      },
    },
    inApp: {
      title: inAppTitle,
      body: inAppBody,
      data: {
        ...shared,
        screen: "event_detail",
      },
      metadata: {
        ...metadata,
        ...shared,
      },
    },
    email: {
      template: "email/event_lifecycle_notice.hbs",
      metadata: {
        ...metadata,
        ...shared,
        subject: emailSubject,
        title: emailTitle,
        badgeLabel,
        headerTitle,
        introText,
        ctaText: "Ver detalle del evento",
        link: eventLink,
        eventImage,
        eventDateDisplay,
        eventTimeRange,
        eventLocation,
        eventAddress,
        detailsSectionTitle,
        dateLabel,
        timeLabel,
        locationLabel,
        recommendationTitle: "Recomendaciones",
        recommendationItems,
      },
    },
  };
}

const TEMPLATES = {
  CHAT_USER_START: {
    triggerId: "CHAT_USER_START",
    defaultChannels: ["push", "inApp", "whatsapp", "email"],
    required: ["userId", "eventName"],
    build: ({ metadata }) => ({
      push: {
        title: `¡El chat de ${metadata.eventName} ya está abierto!`,
        body: `Únete ahora${metadata.link ? `: ${metadata.link}` : ""}`,
        metadata: {
          userId: metadata.userId,
          eventName: metadata.eventName,
          link: metadata.link,
        },
      },
      inApp: {
        title: `¡Bienvenido al chat de ${metadata.eventName}!`,
        body: `Preséntate y empieza a conversar.`,
        metadata: { eventName: metadata.eventName, userId: metadata.userId },
      },
      whatsapp: {
        template: "whatsapp/chat_user_start.js",
        metadata: {
          title: `Chat abierto`,
          body: `Únete al chat de ${metadata.eventName}`,
          ...metadata,
        },
      },
      email: {
        template: "email/chat_user_start.hbs",
        metadata: {
          title: `El chat para ${metadata.eventName} está abierto.`,
          body: `¡Hola${
            metadata.userName ? " " + metadata.userName : ""
          }! Ya puedes unirte a la conversación del evento.`,
          ...metadata,
        },
      },
    }),
  },

  CHAT_USER_INVITE_SEND: {
    triggerId: "CHAT_USER_INVITE_SEND",
    defaultChannels: ["push", "inApp", "email", "whatsapp"],
    required: ["userId", "eventName", "invitedBy", "link", "roomId"],
    build: ({ metadata }) => {
      const inviterName = metadata.invitedBy || metadata.eventName || "Alguien";
      const isDirectChat = metadata.chatType === "direct";
      const isEventChat = metadata.chatType === "event" || (
        !isDirectChat && metadata.type === "chat-room-invitation" && metadata.eventId
      );
      const roomRoute = metadata.route || `/chat?roomId=${encodeURIComponent(metadata.roomId || metadata.link || "")}&invite=1`;
      const directMetadata = {
        ...metadata,
        type: "chat-room-invitation",
        chatType: "direct",
        route: roomRoute,
      };

      if (isEventChat) {
        return {
          push: {
            title: `Invitación al chat de ${metadata.eventName || "un evento"}`,
            body: `${inviterName} te invitó al chat del evento. Acepta para unirte.`,
            metadata: directMetadata,
          },
          inApp: {
            title: `Invitación al chat: ${metadata.eventName || "Evento"}`,
            body: `${inviterName} te invitó al chat del evento. Acepta para participar.`,
            metadata: {
              ...metadata,
              type: "chat-room-invitation",
              chatType: "event",
              route: roomRoute,
            },
          },
          email: {
            title: `Invitación al chat de ${metadata.eventName || "un evento"}`,
            body: `${inviterName} te invitó al chat del evento en Do events. Entra para aceptar la invitación.`,
            template: "email/chat_user_invite_send.hbs",
            metadata: {
              ...metadata,
              type: "chat-room-invitation",
              chatType: "event",
              route: roomRoute,
            },
          },
          whatsapp: {
            title: "Invitación al chat del evento",
            body: `${inviterName} te invitó al chat de ${metadata.eventName || "un evento"} en Do events.`,
            template: "whatsapp/chat_user_invite_send.js",
            metadata: {
              ...metadata,
              type: "chat-room-invitation",
              chatType: "event",
            },
          },
        };
      }

      if (isDirectChat) {
        return {
          push: {
            title: `${inviterName} quiere chatear contigo`,
            body: "Acepta la invitación para enviar mensajes privados en Do events.",
            metadata: directMetadata,
          },
          inApp: {
            title: `${inviterName} quiere enviarte un mensaje`,
            body: "Acepta una sola vez para chatear libremente.",
            metadata: directMetadata,
          },
          email: {
            title: `${inviterName} quiere chatear contigo`,
            body: `${inviterName} quiere enviarte un mensaje privado. Entra a Do events para aceptar la invitación.`,
            template: "email/chat_user_invite_send.hbs",
            metadata: directMetadata,
          },
          whatsapp: {
            title: "Solicitud de chat privado",
            body: `${inviterName} quiere enviarte un mensaje privado en Do events.`,
            template: "whatsapp/chat_user_invite_send.js",
            metadata: directMetadata,
          },
        };
      }

      return {
        push: {
          title: `¡Te han agregado al chat de ${metadata.eventName}!`,
          body: `${metadata.invitedBy} te ha invitado a unirte al chat.`,
          metadata,
        },
        inApp: {
          title: `Invitación al chat: ${metadata.eventName}`,
          body: `Has sido invitado por ${metadata.invitedBy} para unirte al chat del evento.`,
          metadata,
        },
        email: {
          title: `Invitación al chat de ${metadata.eventName}`,
          body: `${metadata.invitedBy} te invitó al chat.`,
          template: "email/chat_user_invite_send.hbs",
          metadata,
        },
        whatsapp: {
          title: `Invitación al chat`,
          body: `${metadata.invitedBy} te invitó al chat de ${metadata.eventName}`,
          template: "whatsapp/chat_user_invite_send.js",
          metadata,
        },
      };
    },
  },

  CHAT_USER_INVITE_ACCEPTED: {
    triggerId: "CHAT_USER_INVITE_ACCEPTED",
    defaultChannels: ["push", "inApp", "email", "whatsapp"],
    required: ["userId", "eventName", "invitedBy", "userName"],
    build: ({ metadata }) => ({
      push: {
        title: `Invitación aceptada: ${metadata.eventName}`,
        body: `${metadata.userName} se unió al chat del evento.`,
        metadata,
      },
      inApp: {
        title: `Invitación aceptada — ${metadata.eventName}`,
        body: `${metadata.userName} aceptó unirse al chat (invitado por ${metadata.invitedBy}).`,
        metadata,
      },
      email: {
        template: "email/chat_user_invite_send.hbs",
        title: `Invitación aceptada: ${metadata.eventName}`,
        body: `${metadata.userName} aceptó la invitación al chat.`,
        metadata,
      },
      whatsapp: {
        title: `Invitación aceptada`,
        body: `${metadata.userName} se unió al chat de ${metadata.eventName}`,
        template: "whatsapp/chat_user_invite_send.js",
        metadata,
      },
    }),
  },

  CHAT_USER_INVITE_DECLINED: {
    triggerId: "CHAT_USER_INVITE_DECLINED",
    defaultChannels: ["push", "inApp", "email", "whatsapp"],
    required: ["userId", "eventName", "invitedBy"],
    build: ({ metadata }) => ({
      push: {
        title: `¡Te han agregado al chat de ${metadata.eventName}!`,
        body: `${metadata.invitedBy} te ha invitado a unirte al chat.`,
        metadata: { userId: metadata.userId, eventName: metadata.eventName },
      },
      inApp: {
        title: `Invitación al chat: ${metadata.eventName}`,
        body: `Has sido invitado por ${metadata.invitedBy} para unirte al chat del evento.`,
      },
      email: {
        template: "email/chat_user_invite.hbs",
        metadata: {
          title: `Invitación al chat de ${metadata.eventName}`,
          body: `${metadata.invitedBy} te invitó al chat.`,
          ...metadata,
        },
      },
      whatsapp: {
        template: "whatsapp/chat_user_invite.js",
        metadata: {
          title: `Invitación al chat`,
          body: `${metadata.invitedBy} te invitó al chat de ${metadata.eventName}`,
          ...metadata,
        },
      },
    }),
  },

  CHAT_USER_NEW_MESSAGE: {
    triggerId: "CHAT_USER_NEW_MESSAGE",
    defaultChannels: ["inApp", "push", "email"],
    required: ["userId", "eventName", "message"],
    build: ({ metadata }) => ({
      inApp: {
        title: `${metadata.senderName || "Alguien"} está intentando contactarte`,
        body: `${metadata.senderName || "Alguien"} está intentando contactarte por chat.`,
        metadata: {
          userId: metadata.userId,
          messageId: metadata.messageId,
          roomId: metadata.roomId,
          senderName: metadata.senderName,
          type: "chat-message",
          route: metadata.route,
          link: metadata.link,
          templateKey: "CHAT_USER_NEW_MESSAGE",
        },
      },
      push: {
        title: `${metadata.senderName || "Alguien"} está intentando contactarte`,
        body: `${metadata.senderName || "Alguien"} está intentando contactarte por chat.`,
        metadata: {
          userId: metadata.userId,
          messageId: metadata.messageId,
          roomId: metadata.roomId,
          senderName: metadata.senderName,
          type: "chat-message",
          route: metadata.route,
        },
      },
      email: {
        title: `${metadata.senderName || "Alguien"} está intentando contactarte`,
        body: `${metadata.senderName || "Alguien"} te envió un mensaje y está intentando contactarte.`,
        template: "email/chat_user_new_message.hbs",
        metadata: {
          title: `${metadata.senderName || "Alguien"} está intentando contactarte`,
          eventName: metadata.eventName || "Chat",
          senderName: metadata.senderName || "Alguien",
          message: metadata.message,
          link: metadata.link,
          ...metadata,
        },
      },
    }),
  },

  CHAT_USER_MENTION: {
    triggerId: "CHAT_USER_MENTION",
    defaultChannels: ["push", "inApp"],
    required: ["userId", "eventName", "mentioner", "message"],
    build: ({ metadata }) => ({
      push: {
        title: `Mención en ${metadata.eventName}`,
        body: `${metadata.mentioner} te mencionó: ${metadata.message}`,
        metadata: { userId: metadata.userId, eventName: metadata.eventName },
      },
      inApp: {
        title: `Te han mencionado`,
        body: `${metadata.mentioner} te mencionó en ${metadata.eventName}`,
      },
    }),
  },

  CHAT_USER_ANNOUNCEMENT: {
    triggerId: "CHAT_USER_ANNOUNCEMENT",
    defaultChannels: ["inApp", "push", "whatsapp", "email"],
    required: ["userId", "eventName", "message"],
    build: ({ metadata }) => ({
      inApp: {
        title: `Anuncio: ${metadata.eventName}`,
        body: metadata.message,
      },
      push: {
        title: `Anuncio en ${metadata.eventName}`,
        body: metadata.message,
        metadata: { userId: metadata.userId, eventName: metadata.eventName },
      },
      whatsapp: {
        template: "whatsapp/chat_user_announcement.js",
        metadata: {
          title: `Anuncio importante`,
          body: `${metadata.message}`,
          ...metadata,
        },
      },
      email: {
        template: "email/chat_user_announcement.hbs",
        metadata: {
          title: `Anuncio importante: ${metadata.eventName}`,
          body: metadata.message,
          ...metadata,
        },
      },
    }),
  },

  CHAT_USER_CLOSING_NOTICE: {
    triggerId: "CHAT_USER_CLOSING_NOTICE",
    defaultChannels: ["push", "email"],
    required: ["userId", "eventName"],
    build: ({ metadata }) => ({
      push: {
        title: `El chat para ${metadata.eventName} se cerrará pronto`,
        body: metadata.message || "",
        metadata: { userId: metadata.userId, eventName: metadata.eventName },
      },
      email: {
        template: "email/chat_user_closing_notice.hbs",
        metadata: {
          title: `El chat de ${metadata.eventName} cerrará pronto.`,
          body: metadata.message || "",
          ...metadata,
        },
      },
    }),
  },

  CHAT_USER_CLOSED: {
    triggerId: "CHAT_USER_CLOSED",
    defaultChannels: ["push", "email"],
    required: ["userId", "eventName"],
    build: ({ metadata }) => ({
      push: {
        title: `La conversación en ${metadata.eventName} ha finalizado.`,
        body: "¡Gracias por participar!",
        metadata: { userId: metadata.userId, eventName: metadata.eventName },
      },
      email: {
        template: "email/chat_user_closed.hbs",
        metadata: {
          title: `El chat de ${metadata.eventName} ha finalizado.`,
          body: `Gracias por tu participación.`,
          ...metadata,
        },
      },
    }),
  },

  CHAT_USER_BANNED: {
    triggerId: "CHAT_USER_BANNED",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventName"],
    build: ({ metadata }) => ({
      push: {
        title: `Acceso revocado al chat de ${metadata.eventName}`,
        body: `Tu acceso al chat ha sido revocado.`,
        metadata: { userId: metadata.userId, eventName: metadata.eventName },
      },
      inApp: {
        title: `Acceso revocado al chat de ${metadata.eventName}`,
        body: `Tu acceso al chat ha sido revocado.`,
        metadata: {
          userId: metadata.userId,
          eventName: metadata.eventName,
          roomId: metadata.roomId,
          type: metadata.type || "chat-room-moderation",
          status: metadata.status || "user-kicked-out",
          ...metadata,
        },
      },
      email: {
        template: "email/chat_user_banned.hbs",
        metadata: {
          title: `Acceso revocado`,
          body: `Tu acceso al chat ha sido revocado.`,
          ...metadata,
        },
      },
    }),
  },

  CHAT_USER_PROMOTED_TO_ADMIN: {
    triggerId: "CHAT_USER_PROMOTED_TO_ADMIN",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventName", "promotedBy"],
    build: ({ metadata }) => ({
      push: {
        title: `Ahora eres administrador en ${metadata.eventName}`,
        body: `${metadata.promotedBy} te asigno como administrador del chat.`,
        metadata: {
          userId: metadata.userId,
          eventName: metadata.eventName,
          roomId: metadata.roomId,
          type: metadata.type || "chat-room-moderation",
          status: metadata.status || "user-promoted-admin",
          ...metadata,
        },
      },
      inApp: {
        title: `Rol actualizado en ${metadata.eventName}`,
        body: `Ahora eres administrador del chat del evento.`,
        metadata: {
          userId: metadata.userId,
          eventName: metadata.eventName,
          roomId: metadata.roomId,
          type: metadata.type || "chat-room-moderation",
          status: metadata.status || "user-promoted-admin",
          ...metadata,
        },
      },
      email: {
        template: "email/chat_user_promoted_admin.hbs",
        metadata: {
          title: `Ahora eres administrador del chat de ${metadata.eventName}`,
          body: `${metadata.promotedBy} te promovio como administrador del chat del evento.`,
          ...metadata,
        },
      },
    }),
  },

  CHAT_USER_DEMOTED_FROM_ADMIN: {
    triggerId: "CHAT_USER_DEMOTED_FROM_ADMIN",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventName", "demotedBy"],
    build: ({ metadata }) => ({
      push: {
        title: `Tu rol fue actualizado en ${metadata.eventName}`,
        body: `${metadata.demotedBy} removio tus permisos de administrador del chat.`,
        metadata: {
          userId: metadata.userId,
          eventName: metadata.eventName,
          roomId: metadata.roomId,
          type: metadata.type || "chat-room-moderation",
          status: metadata.status || "user-demoted-admin",
          ...metadata,
        },
      },
      inApp: {
        title: `Rol actualizado en ${metadata.eventName}`,
        body: `Ya no eres administrador del chat del evento.`,
        metadata: {
          userId: metadata.userId,
          eventName: metadata.eventName,
          roomId: metadata.roomId,
          type: metadata.type || "chat-room-moderation",
          status: metadata.status || "user-demoted-admin",
          ...metadata,
        },
      },
      email: {
        template: "email/chat_user_demoted_admin.hbs",
        metadata: {
          title: `Actualizacion de rol en el chat de ${metadata.eventName}`,
          body: `${metadata.demotedBy} removio tus permisos de administrador del chat del evento.`,
          ...metadata,
        },
      },
    }),
  },

  ADMIN_NEW_PARTICIPANT: {
    triggerId: "ADMIN_NEW_PARTICIPANT",
    defaultChannels: ["inApp", "push"],
    required: ["userId", "eventName", "newUserId"],
    build: ({ metadata }) => ({
      inApp: {
        title: `Nuevo participante en ${metadata.eventName}`,
        body: `${metadata.userName || metadata.newUserId} se ha unido al chat.`,
      },
      push: {
        title: `Nuevo participante: ${metadata.eventName}`,
        body: `${metadata.userName || metadata.newUserId} se ha unido.`,
        metadata: { userId: metadata.userId, eventName: metadata.eventName },
      },
    }),
  },

  ADMIN_NEW_MESSAGE: {
    triggerId: "ADMIN_NEW_MESSAGE",
    defaultChannels: ["inApp", "push"],
    required: ["userId", "eventName", "message"],
    build: ({ metadata }) => ({
      inApp: {
        title: `Mensaje de administrador en ${metadata.eventName}`,
        body: metadata.message,
      },
      push: {
        title: `Mensaje administrativo`,
        body: metadata.message,
        metadata: { userId: metadata.userId, eventName: metadata.eventName },
      },
    }),
  },

  ADMIN_USER_REPORTED: {
    triggerId: "ADMIN_USER_REPORTED",
    defaultChannels: ["email", "push", "inApp"],
    required: ["userId", "eventName"],
    build: ({ metadata }) => ({
      email: {
        template: "email/admin_user_reported.hbs",
        metadata: {
          title: `Mensaje reportado en ${metadata.eventName}`,
          body: `Un mensaje ha sido reportado y requiere revisión.`,
          ...metadata,
        },
      },
      push: {
        title: `Alerta de moderación`,
        body: `Un mensaje ha sido reportado. Revisa la conversación.`,
        metadata: { userId: metadata.userId, eventName: metadata.eventName },
      },
      inApp: {
        title: `Alerta de moderación`,
        body: `Un mensaje ha sido reportado. Revisa la conversación.`,
        metadata: {
          userId: metadata.userId,
          eventName: metadata.eventName,
          roomId: metadata.roomId,
          type: metadata.type || "chat-room-report",
          status: metadata.status || "report-user-notification",
          ...metadata,
        },
      },
    }),
  },

  ADMIN_ACTIVITY_ALERT: {
    triggerId: "ADMIN_ACTIVITY_ALERT",
    defaultChannels: ["email", "push"],
    required: ["userId", "eventName", "metric"],
    build: ({ metadata }) => ({
      email: {
        template: "email/admin_activity_alert.hbs",
        metadata: {
          title: `Alerta de actividad en ${metadata.eventName}`,
          body: `Alta actividad detectada: ${metadata.metric}`,
          ...metadata,
        },
      },
      push: {
        title: `Alerta de actividad`,
        body: `Volumen inusualmente alto en ${metadata.eventName}`,
        metadata: { userId: metadata.userId, eventName: metadata.eventName },
      },
    }),
  },

  ADMIN_BAN_CONFIRMATION: {
    triggerId: "ADMIN_BAN_CONFIRMATION",
    defaultChannels: ["push"],
    required: ["userId", "bannedUserId"],
    build: ({ metadata }) => ({
      push: {
        title: `Usuario expulsado`,
        body: `Has expulsado a ${metadata.bannedUserId}`,
        metadata: {
          userId: metadata.userId,
          bannedUserId: metadata.bannedUserId,
        },
      },
    }),
  },

  CO_ADMIN_ASSIGNED: {
    triggerId: "CO_ADMIN_ASSIGNED",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "entityType", "entityId", "entityName", "assignedByName"],
    build: ({ metadata }) => {
      const entityLabels = {
        EVENT: "evento",
        VENUE: "lugar",
        SERVICE: "servicio",
        PUBLICATION: "publicación",
      };
      const entityLabel = entityLabels[metadata.entityType] || "contenido";
      const title = `Co-administrador de ${entityLabel}`;
      const body = `${metadata.assignedByName} te dio permisos para editar ${metadata.entityName || entityLabel}.`;
      return {
        push: {
          title,
          body,
          metadata: {
            userId: metadata.userId,
            entityType: metadata.entityType,
            entityId: metadata.entityId,
            entityName: metadata.entityName,
            assignedByUserId: metadata.assignedByUserId,
            assignedByName: metadata.assignedByName,
          },
        },
        inApp: {
          title,
          body,
          metadata: {
            userId: metadata.userId,
            entityType: metadata.entityType,
            entityId: metadata.entityId,
            entityName: metadata.entityName,
            assignedByUserId: metadata.assignedByUserId,
            assignedByName: metadata.assignedByName,
          },
        },
        email: {
          title,
          body,
          metadata: {
            userId: metadata.userId,
            entityType: metadata.entityType,
            entityId: metadata.entityId,
            entityName: metadata.entityName,
            assignedByUserId: metadata.assignedByUserId,
            assignedByName: metadata.assignedByName,
          },
        },
      };
    },
  },

  PLATFORM_ADMIN_GRANTED: {
    triggerId: "PLATFORM_ADMIN_GRANTED",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "grantedByName", "roleLabel"],
    build: ({ metadata }) => {
      const title = `Acceso de ${metadata.roleLabel || "Administrador"}`;
      const body = `${metadata.grantedByName} te otorgó permisos de ${metadata.roleLabel || "administrador"} en DoEvents. Ya puedes acceder al panel de administración.`;
      const enriched = {
        userId: metadata.userId,
        grantedByUserId: metadata.grantedByUserId,
        grantedByName: metadata.grantedByName,
        roleLabel: metadata.roleLabel,
        adminPanelUrl: metadata.adminPanelUrl,
        type: "platform_admin_granted",
      };
      return {
        push: { title, body, metadata: enriched },
        inApp: { title, body, metadata: enriched },
        email: {
          title,
          body: `${body}\n\nIngresa al panel: ${metadata.adminPanelUrl || `${WEB_APP_BASE_URL}/admin`}`,
          metadata: enriched,
        },
      };
    },
  },

  EVENT_CREATED: {
    triggerId: "EVENT_CREATED",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventId", "eventName"],
    build: ({ metadata }) => ({
      push: {
        title: "Evento creado",
        body: `Tu evento "${metadata.eventName}" fue creado. Publícalo cuando estés listo.`,
        metadata,
      },
      inApp: {
        title: "Evento creado",
        body: `Creaste el evento "${metadata.eventName}".`,
        metadata,
      },
      email: {
        title: `Evento creado: ${metadata.eventName}`,
        body: `Tu evento "${metadata.eventName}" fue registrado en DoEvents. Puedes editarlo y publicarlo cuando quieras.`,
        metadata,
      },
    }),
  },

  SERVICE_CREATED: {
    triggerId: "SERVICE_CREATED",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "entityId", "entityName"],
    build: ({ metadata }) => ({
      push: {
        title: "Servicio publicado",
        body: `Tu servicio "${metadata.entityName}" ya está disponible en DoEvents.`,
        metadata,
      },
      inApp: {
        title: "Servicio publicado",
        body: `Publicaste el servicio "${metadata.entityName}".`,
        metadata,
      },
      email: {
        title: `Servicio publicado: ${metadata.entityName}`,
        body: `Tu servicio "${metadata.entityName}" fue publicado correctamente.`,
        metadata,
      },
    }),
  },

  VENUE_CREATED: {
    triggerId: "VENUE_CREATED",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "entityId", "entityName"],
    build: ({ metadata }) => ({
      push: {
        title: "Lugar publicado",
        body: `Tu lugar "${metadata.entityName}" ya está disponible en DoEvents.`,
        metadata,
      },
      inApp: {
        title: "Lugar publicado",
        body: `Publicaste el lugar "${metadata.entityName}".`,
        metadata,
      },
      email: {
        title: `Lugar publicado: ${metadata.entityName}`,
        body: `Tu lugar "${metadata.entityName}" fue publicado correctamente.`,
        metadata,
      },
    }),
  },

  VENUE_BOOKING_CONFIRMED_BUYER: {
    triggerId: "VENUE_BOOKING_CONFIRMED_BUYER",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "venueName", "total"],
    build: ({ metadata }) => {
      const body = `Reserva de lugar confirmada - ${metadata.total}: ${metadata.venueName}`;
      return {
        push: {
          title: "Reserva de lugar confirmada",
          body,
          data: {
            type: "venue_reservation",
            venueId: metadata.venueId || "",
            orderId: metadata.orderId || "",
          },
          metadata: {
            ...metadata,
            type: "venue_reservation",
            senderName: "Sistema",
            message: body,
            venueName: metadata.venueName,
            total: metadata.total,
          },
        },
        inApp: {
          title: "Reserva de lugar confirmada",
          body,
          type: "venue_reservation",
          data: {
            type: "venue_reservation",
            venueId: metadata.venueId || "",
            orderId: metadata.orderId || "",
          },
          metadata: {
            ...metadata,
            type: "venue_reservation",
            senderName: "Sistema",
            message: body,
            venueName: metadata.venueName,
            total: metadata.total,
          },
        },
        email: {
          template: "email/order_payment_approved_buyer.hbs",
          metadata: {
            title: `Comprobante de reserva - ${metadata.venueName}`,
            body: `Tu reserva del lugar "${metadata.venueName}" fue confirmada por un total de ${metadata.total}.`,
            purchaseKind: "venue",
            entityPanelTitle: "Lugar",
            itemCountLabel: "días reservados",
            detailCtaLabel: "Ver detalle del lugar",
            eventName: metadata.venueName,
            eventLink: metadata.venueLink,
            detailLink: metadata.venueLink,
            ...metadata,
          },
        },
      };
    },
  },

  VENUE_BOOKING_CONFIRMED_HOST: {
    triggerId: "VENUE_BOOKING_CONFIRMED_HOST",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "venueName", "total", "buyerName"],
    build: ({ metadata }) => {
      const buyerLabel = metadata.buyerName || "Un usuario";
      const body = `${buyerLabel} ¡Tu lugar ha sido reservado! - ${metadata.total}: ${metadata.venueName}`;
      return {
        push: {
          title: "¡Tu lugar fue reservado!",
          body,
          data: {
            type: "venue_reserved",
            venueId: metadata.venueId || "",
            orderId: metadata.orderId || "",
            buyerId: metadata.buyerId || "",
          },
          metadata: {
            ...metadata,
            type: "venue_reserved",
            senderName: buyerLabel,
            message: body,
            venueName: metadata.venueName,
            total: metadata.total,
          },
        },
        inApp: {
          title: "¡Tu lugar fue reservado!",
          body,
          type: "venue_reserved",
          data: {
            type: "venue_reserved",
            venueId: metadata.venueId || "",
            orderId: metadata.orderId || "",
            buyerId: metadata.buyerId || "",
          },
          metadata: {
            ...metadata,
            type: "venue_reserved",
            senderName: buyerLabel,
            message: body,
            venueName: metadata.venueName,
            total: metadata.total,
          },
        },
        email: {
          template: "email/order_new_sale_owner.hbs",
          metadata: {
            title: `Nueva reserva - ${metadata.venueName}`,
            body: `${buyerLabel} reservó tu lugar "${metadata.venueName}" por ${metadata.total}.`,
            purchaseKind: "venue",
            entityPanelTitle: "Lugar",
            itemCountLabel: "días reservados",
            eventName: metadata.venueName,
            eventLink: metadata.venueLink,
            detailLink: metadata.venueLink,
            buyerName: buyerLabel,
            saleIntroText: `${buyerLabel} reservó tu lugar.`,
            ...metadata,
          },
        },
      };
    },
  },

  SERVICE_BOOKING_CONFIRMED_BUYER: {
    triggerId: "SERVICE_BOOKING_CONFIRMED_BUYER",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "serviceName", "total"],
    build: ({ metadata }) => {
      const body = `Reserva de servicio confirmada - ${metadata.total}: ${metadata.serviceName}`;
      return {
        push: {
          title: "Reserva de servicio confirmada",
          body,
          data: {
            type: "service_booking",
            serviceId: metadata.serviceId || "",
            orderId: metadata.orderId || "",
          },
          metadata: {
            ...metadata,
            type: "service_booking",
            senderName: "Sistema",
            message: body,
            serviceName: metadata.serviceName,
            total: metadata.total,
          },
        },
        inApp: {
          title: "Reserva de servicio confirmada",
          body,
          type: "service_booking",
          data: {
            type: "service_booking",
            serviceId: metadata.serviceId || "",
            orderId: metadata.orderId || "",
          },
          metadata: {
            ...metadata,
            type: "service_booking",
            senderName: "Sistema",
            message: body,
            serviceName: metadata.serviceName,
            total: metadata.total,
          },
        },
        email: {
          template: "email/order_payment_approved_buyer.hbs",
          metadata: {
            title: `Comprobante de reserva - ${metadata.serviceName}`,
            body: `Tu reserva del servicio "${metadata.serviceName}" fue confirmada por un total de ${metadata.total}.`,
            purchaseKind: "service",
            entityPanelTitle: "Servicio",
            itemCountLabel: "reservas",
            detailCtaLabel: "Ver detalle del servicio",
            eventName: metadata.serviceName,
            eventLink: metadata.serviceLink,
            detailLink: metadata.serviceLink,
            ...metadata,
          },
        },
      };
    },
  },

  SERVICE_BOOKING_CONFIRMED_PROVIDER: {
    triggerId: "SERVICE_BOOKING_CONFIRMED_PROVIDER",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "serviceName", "total", "buyerName"],
    build: ({ metadata }) => {
      const buyerLabel = metadata.buyerName || "Un usuario";
      const body = `${buyerLabel} ¡Tu servicio ha sido reservado! - ${metadata.total}: ${metadata.serviceName}`;
      return {
        push: {
          title: "¡Tu servicio fue reservado!",
          body,
          data: {
            type: "service_booked",
            serviceId: metadata.serviceId || "",
            orderId: metadata.orderId || "",
            buyerId: metadata.buyerId || "",
          },
          metadata: {
            ...metadata,
            type: "service_booked",
            senderName: buyerLabel,
            message: body,
            serviceName: metadata.serviceName,
            total: metadata.total,
          },
        },
        inApp: {
          title: "¡Tu servicio fue reservado!",
          body,
          type: "service_booked",
          data: {
            type: "service_booked",
            serviceId: metadata.serviceId || "",
            orderId: metadata.orderId || "",
            buyerId: metadata.buyerId || "",
          },
          metadata: {
            ...metadata,
            type: "service_booked",
            senderName: buyerLabel,
            message: body,
            serviceName: metadata.serviceName,
            total: metadata.total,
          },
        },
        email: {
          template: "email/order_new_sale_owner.hbs",
          metadata: {
            title: `Nueva reserva - ${metadata.serviceName}`,
            body: `${buyerLabel} reservó tu servicio "${metadata.serviceName}" por ${metadata.total}.`,
            purchaseKind: "service",
            entityPanelTitle: "Servicio",
            itemCountLabel: "reservas",
            eventName: metadata.serviceName,
            eventLink: metadata.serviceLink,
            detailLink: metadata.serviceLink,
            buyerName: buyerLabel,
            saleIntroText: `${buyerLabel} reservó tu servicio.`,
            ...metadata,
          },
        },
      };
    },
  },

  EVENT_INVITATION_ACCEPTED: {
    triggerId: "EVENT_INVITATION_ACCEPTED",
    defaultChannels: ["push", "inApp", "email", "whatsapp"],
    required: ["userId", "eventId", "eventName", "guestName"],
    build: ({ metadata }) => ({
      push: {
        title: "Invitación aceptada",
        body: `${metadata.guestName} aceptó tu invitación a "${metadata.eventName}".`,
        metadata,
      },
      inApp: {
        title: "Invitación aceptada",
        body: `${metadata.guestName} confirmó asistencia a "${metadata.eventName}".`,
        metadata,
      },
      email: {
        title: `Invitación aceptada: ${metadata.eventName}`,
        body: `${metadata.guestName} aceptó participar en tu evento "${metadata.eventName}".`,
        metadata,
      },
      whatsapp: {
        title: "Invitación aceptada",
        body: `${metadata.guestName} aceptó tu invitación al evento ${metadata.eventName}.`,
        metadata,
      },
    }),
  },

  EVENT_INVITATION_REJECTED: {
    triggerId: "EVENT_INVITATION_REJECTED",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventId", "eventName", "guestName"],
    build: ({ metadata }) => ({
      push: {
        title: "Invitación rechazada",
        body: `${metadata.guestName} rechazó tu invitación a "${metadata.eventName}".`,
        metadata,
      },
      inApp: {
        title: "Invitación rechazada",
        body: `${metadata.guestName} no asistirá a "${metadata.eventName}".`,
        metadata,
      },
      email: {
        title: `Invitación rechazada: ${metadata.eventName}`,
        body: `${metadata.guestName} rechazó la invitación a tu evento "${metadata.eventName}".`,
        metadata,
      },
    }),
  },

  STAFF_ASSIGNED: {
    triggerId: "STAFF_ASSIGNED",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventId", "eventName", "gateId", "gateName", "venueName"],
    build: ({ metadata }) => ({
      push: {
        title: `Asignación a puerta: ${metadata.eventName}`,
        body: `Te han asignado a la puerta "${metadata.gateName}" en ${metadata.venueName}.`,
        metadata: {
          userId: metadata.userId,
          eventId: metadata.eventId,
          eventName: metadata.eventName,
          gateId: metadata.gateId,
          gateName: metadata.gateName,
          venueName: metadata.venueName,
        },
      },
      inApp: {
        title: `Asignado a puerta: ${metadata.gateName}`,
        body: `Evento: ${metadata.eventName}. Lugar: ${metadata.venueName}. Puerta: ${metadata.gateName}.`,
        metadata: {
          userId: metadata.userId,
          eventId: metadata.eventId,
          eventName: metadata.eventName,
          gateId: metadata.gateId,
          gateName: metadata.gateName,
          venueName: metadata.venueName,
        },
      },
      email: {
        title: `Asignación de staff: ${metadata.eventName}`,
        body: `Has sido asignado a la puerta "${metadata.gateName}" del evento ${metadata.eventName} en ${metadata.venueName}.`,
        metadata: {
          userId: metadata.userId,
          eventId: metadata.eventId,
          eventName: metadata.eventName,
          gateId: metadata.gateId,
          gateName: metadata.gateName,
          venueName: metadata.venueName,
        },
      },
    }),
  },

  // NUEVOS TEMPLATES PARA EVENTOS REPROGRAMADOS Y CANCELADOS
  EVENT_RESCHEDULED: {
    triggerId: "EVENT_RESCHEDULED",
    defaultChannels: ["push", "email", "inApp", "whatsapp"],
    required: [
      "userId",
      "eventName",
      "newStartDate",
      "newEndDate",
      "originalStartDate",
      "originalEndDate",
    ],
    build: ({ metadata }) => {
      const formatDate = (dateStr) => {
        if (!dateStr || dateStr.length !== 8) return dateStr;
        return `${dateStr.substring(6, 8)}/${dateStr.substring(
          4,
          6,
        )}/${dateStr.substring(0, 4)}`;
      };

      const newStartFormatted = formatDate(metadata.newStartDate);
      const newEndFormatted = formatDate(metadata.newEndDate);
      const originalStartFormatted = formatDate(metadata.originalStartDate);
      const originalEndFormatted = formatDate(metadata.originalEndDate);

      return {
        push: {
          title: `📅 ${metadata.eventName} ha sido reprogramado`,
          body: `Nueva fecha: ${newStartFormatted}${
            newEndFormatted !== newStartFormatted ? ` - ${newEndFormatted}` : ""
          }`,
          metadata: {
            userId: metadata.userId,
            eventName: metadata.eventName,
            eventId: metadata.eventId,
            newStartDate: metadata.newStartDate,
            newEndDate: metadata.newEndDate,
          },
        },
        email: {
          template: "email/event_rescheduled.hbs",
          metadata: {
            title: `Reprogramación de ${metadata.eventName}`,
            eventName: metadata.eventName,
            eventId: metadata.eventId,
            eventImage: metadata.eventImage || "",
            venue: metadata.venue || "",
            originalStartDate: originalStartFormatted,
            originalEndDate: originalEndFormatted,
            newStartDate: newStartFormatted,
            newEndDate: newEndFormatted,
            ticketSaleStartDate: metadata.ticketSaleStartDate || "",
            ticketSaleEndDate: metadata.ticketSaleEndDate || "",
            ticketSaleStartTime: metadata.ticketSaleStartTime || "",
            ticketSaleEndTime: metadata.ticketSaleEndTime || "",
            reason: metadata.reason || "Motivos organizacionales",
            userName: metadata.userName || "Estimado cliente",
            year: new Date().getFullYear(),
            ...metadata,
          },
        },
        whatsapp: {
          template: "whatsapp/event_rescheduled.js",
          templateName: "event_rescheduled",
          metadata: {
            userName: metadata.userName || "Cliente",
            eventName: metadata.eventName,
            newStartDate: newStartFormatted,
            reason: metadata.reason || "Motivos organizacionales",
            eventId: metadata.eventId,
            eventImage: metadata.eventImage || null,
            ...metadata,
          },
        },
        inApp: {
          title: `📅 Evento reprogramado`,
          body: `${metadata.eventName} se ha reprogramado para el ${newStartFormatted}`,
          metadata: {
            userId: metadata.userId,
            eventId: metadata.eventId,
            eventName: metadata.eventName,
            type: "event_rescheduled",
          },
        },
      };
    },
  },

  EVENT_CANCELLED: {
    triggerId: "EVENT_CANCELLED",
    defaultChannels: ["push", "email", "inApp", "whatsapp"],
    required: ["userId", "eventName", "eventStartDate"],
    build: ({ metadata }) => {
      const formatDate = (dateStr) => {
        if (!dateStr || dateStr.length !== 8) return dateStr;
        return `${dateStr.substring(6, 8)}/${dateStr.substring(
          4,
          6,
        )}/${dateStr.substring(0, 4)}`;
      };

      const originalStartFormatted = formatDate(
        metadata.originalStartDate || metadata.eventStartDate,
      );
      const originalEndFormatted = formatDate(
        metadata.originalEndDate || metadata.eventEndDate || metadata.eventStartDate,
      );

      return {
        push: {
          title: `❌ ${metadata.eventName} ha sido cancelado`,
          body: `Procesaremos tu reembolso automáticamente. Más detalles por email.`,
          metadata: {
            userId: metadata.userId,
            eventName: metadata.eventName,
            eventId: metadata.eventId,
            type: "event_cancelled",
          },
        },
        email: {
          template: "email/event_cancelled.hbs",
          metadata: {
            title: `Cancelación de ${metadata.eventName}`,
            eventName: metadata.eventName,
            eventId: metadata.eventId,
            eventImage: metadata.eventImage || "",
            venue: metadata.venue || "",
            originalStartDate: originalStartFormatted,
            originalEndDate: originalEndFormatted,
            reason: metadata.reason || "Motivos ajenos a la organización",
            userName: metadata.userName || "Estimado cliente",
            orderId: metadata.orderId || "",
            year: new Date().getFullYear(),
            ...metadata,
          },
        },
        whatsapp: {
          template: "whatsapp/event_cancelled.js",
          templateName: "event_cancelled",
          metadata: {
            userName: metadata.userName || "Cliente",
            eventName: metadata.eventName,
            reason: metadata.reason || "Motivos ajenos a la organización",
            eventId: metadata.eventId,
            eventImage: metadata.eventImage || null,
            ...metadata,
          },
        },
        inApp: {
          title: `❌ Evento cancelado`,
          body: `${metadata.eventName} ha sido cancelado. Recibirás un reembolso completo.`,
          metadata: {
            userId: metadata.userId,
            eventId: metadata.eventId,
            eventName: metadata.eventName,
            type: "event_cancelled",
          },
        },
      };
    },
  },

  EVENT_CANCELLED_OWNER: {
    triggerId: "EVENT_CANCELLED_OWNER",
    defaultChannels: ["push", "email", "inApp"],
    required: ["userId", "eventName"],
    build: ({ metadata }) => {
      const formatDate = (dateStr) => {
        if (!dateStr || dateStr.length !== 8) return dateStr || "";
        return `${dateStr.substring(6, 8)}/${dateStr.substring(4, 6)}/${dateStr.substring(0, 4)}`;
      };
      return {
        push: {
          title: `Tu evento fue cancelado: ${metadata.eventName}`,
          body: `${metadata.affectedOrders || 0} órdenes afectadas. Los reembolsos se procesarán automáticamente.`,
          metadata: {
            userId: metadata.userId,
            eventName: metadata.eventName,
            eventId: metadata.eventId,
            type: "event_cancelled_owner",
          },
        },
        email: {
          template: "email/event_cancelled_owner.hbs",
          metadata: {
            ownerName: metadata.ownerName || metadata.userName || "Organizador",
            eventName: metadata.eventName,
            eventId: metadata.eventId,
            originalStartDate: formatDate(metadata.originalStartDate || metadata.eventStartDate),
            originalEndDate: formatDate(metadata.originalEndDate || metadata.eventEndDate || metadata.eventStartDate),
            affectedOrders: metadata.affectedOrders || 0,
            affectedUsers: metadata.affectedUsers || metadata.affectedOrders || 0,
            refundsPending: metadata.refundsPending || metadata.affectedOrders || 0,
            reason: metadata.reason || "",
            executionDate: metadata.executionDate || new Date().toLocaleDateString("es-CO"),
            year: new Date().getFullYear(),
            ...metadata,
            ownerNextSteps:
              Array.isArray(metadata.ownerNextSteps) && metadata.ownerNextSteps.length > 0
                ? metadata.ownerNextSteps
                : [
                    "Los reembolsos seran procesados automaticamente en 5-7 dias habiles.",
                    "Todos los compradores ya fueron notificados por email y otros canales.",
                    "Puedes revisar el estado de tu evento desde la plataforma.",
                  ],
          },
        },
        inApp: {
          title: `Evento cancelado`,
          body: `Tu evento ${metadata.eventName} ha sido cancelado. ${metadata.affectedOrders || 0} compradores fueron notificados.`,
          metadata: {
            userId: metadata.userId,
            eventId: metadata.eventId,
            eventName: metadata.eventName,
            type: "event_cancelled_owner",
          },
        },
      };
    },
  },

  EVENT_RESCHEDULED_OWNER: {
    triggerId: "EVENT_RESCHEDULED_OWNER",
    defaultChannels: ["push", "email", "inApp"],
    required: ["userId", "eventName", "newStartDate"],
    build: ({ metadata }) => {
      const formatDate = (dateStr) => {
        if (!dateStr || dateStr.length !== 8) return dateStr || "";
        return `${dateStr.substring(6, 8)}/${dateStr.substring(4, 6)}/${dateStr.substring(0, 4)}`;
      };
      const newStartFormatted = formatDate(metadata.newStartDate);
      return {
        push: {
          title: `Reagendamiento confirmado: ${metadata.eventName}`,
          body: `Nueva fecha: ${newStartFormatted}. ${metadata.affectedOrders || 0} compradores notificados.`,
          metadata: {
            userId: metadata.userId,
            eventName: metadata.eventName,
            eventId: metadata.eventId,
            type: "event_rescheduled_owner",
          },
        },
        email: {
          template: "email/event_rescheduled_owner.hbs",
          metadata: {
            ownerName: metadata.ownerName || metadata.userName || "Organizador",
            eventName: metadata.eventName,
            eventId: metadata.eventId,
            originalStartDate: formatDate(metadata.originalStartDate),
            originalEndDate: formatDate(metadata.originalEndDate),
            newStartDate: formatDate(metadata.newStartDate),
            newEndDate: formatDate(metadata.newEndDate),
            ticketSaleStartDate: metadata.ticketSaleStartDate || "",
            ticketSaleEndDate: metadata.ticketSaleEndDate || "",
            ticketSaleStartTime: metadata.ticketSaleStartTime || "",
            ticketSaleEndTime: metadata.ticketSaleEndTime || "",
            affectedOrders: metadata.affectedOrders || 0,
            reason: metadata.reason || "",
            executionDate: metadata.executionDate || new Date().toLocaleDateString("es-CO"),
            year: new Date().getFullYear(),
            ...metadata,
            ownerNextSteps:
              Array.isArray(metadata.ownerNextSteps) && metadata.ownerNextSteps.length > 0
                ? metadata.ownerNextSteps
                : [
                    "Todos los compradores ya fueron notificados de las nuevas fechas.",
                    "Las entradas existentes siguen siendo validas automaticamente.",
                    "Puedes revisar el estado de tu evento desde la plataforma.",
                  ],
          },
        },
        inApp: {
          title: `Reagendamiento confirmado`,
          body: `Tu evento ${metadata.eventName} fue reagendado para el ${newStartFormatted}. ${metadata.affectedOrders || 0} compradores notificados.`,
          metadata: {
            userId: metadata.userId,
            eventId: metadata.eventId,
            eventName: metadata.eventName,
            type: "event_rescheduled_owner",
          },
        },
      };
    },
  },

  FEED_NEW_PUBLICATION_FOLLOWER: {
    triggerId: "FEED_NEW_PUBLICATION_FOLLOWER",
    defaultChannels: ["push", "inApp"],
    required: ["userId", "actorUserId", "actorName", "publicationId"],
    build: ({ metadata }) => {
      const titleSuffix = metadata.publicationTitle
        ? `: ${metadata.publicationTitle}`
        : "";
      const preview = metadata.publicationDescription
        ? truncate(metadata.publicationDescription, 120)
        : `Revisa la nueva ${metadata.publicationType || "publicación"}.`;

      return {
        push: {
          title: `🆕 ${metadata.actorName} publicó${titleSuffix}`,
          body: preview,
          data: {
            type: "feed_new_publication",
            publicationId: metadata.publicationId,
            actorUserId: metadata.actorUserId,
          },
          metadata: {
            ...metadata,
            type: "feed_new_publication",
          },
        },
        inApp: {
          title: `${metadata.actorName} publicó algo nuevo`,
          body: preview,
          type: "feed_new_publication",
          data: {
            publicationId: metadata.publicationId,
            actorUserId: metadata.actorUserId,
          },
          metadata: {
            ...metadata,
            type: "feed_new_publication",
          },
        },
      };
    },
  },

  FOLLOW_REQUEST_RECEIVED: {
    triggerId: "FOLLOW_REQUEST_RECEIVED",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "actorUserId", "actorName"],
    build: ({ metadata }) => {
      const actorLabel = metadata.actorUsername
        ? `${metadata.actorName} (${metadata.actorUsername})`
        : metadata.actorName;
      const title = "Nueva solicitud de seguimiento";
      const body = `${actorLabel} quiere seguirte.`;
      const sharedMeta = {
        ...metadata,
        type: "follow_request_received",
        senderName: metadata.actorName,
        message: "quiere seguirte",
        title,
        body,
        subject: title,
      };

      return {
        push: {
          title,
          body,
          data: {
            type: "follow_request_received",
            actorUserId: metadata.actorUserId,
            followId: metadata.followId || "",
          },
          metadata: sharedMeta,
        },
        inApp: {
          title,
          body,
          type: "follow_request_received",
          data: {
            actorUserId: metadata.actorUserId,
            followId: metadata.followId || "",
          },
          metadata: sharedMeta,
        },
        email: {
          template: "email/follow_social_notice.hbs",
          metadata: {
            ...sharedMeta,
            ctaText: "Ver solicitudes",
            link: metadata.notificationsLink || metadata.link || "",
          },
        },
      };
    },
  },

  FOLLOW_USER_STARTED_FOLLOWING: {
    triggerId: "FOLLOW_USER_STARTED_FOLLOWING",
    defaultChannels: ["push", "inApp"],
    required: ["userId", "actorUserId", "actorName"],
    build: ({ metadata }) => {
      const actorLabel = metadata.actorUsername
        ? `${metadata.actorName} (${metadata.actorUsername})`
        : metadata.actorName;

      return {
        push: {
          title: "Nuevo seguidor",
          body: `${actorLabel} empezó a seguirte.`,
          data: {
            type: "follow_user_started_following",
            actorUserId: metadata.actorUserId,
            followId: metadata.followId || "",
          },
          metadata: {
            ...metadata,
            type: "follow_user_started_following",
          },
        },
        inApp: {
          title: "Nuevo seguidor",
          body: `${actorLabel} empezó a seguirte.`,
          type: "follow_user_started_following",
          data: {
            actorUserId: metadata.actorUserId,
            followId: metadata.followId || "",
          },
          metadata: {
            ...metadata,
            type: "follow_user_started_following",
          },
        },
      };
    },
  },

  FOLLOW_REQUEST_ACCEPTED: {
    triggerId: "FOLLOW_REQUEST_ACCEPTED",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "actorUserId", "actorName"],
    build: ({ metadata }) => {
      const actorLabel = metadata.actorUsername
        ? `${metadata.actorName} (${metadata.actorUsername})`
        : metadata.actorName;
      const title = "Solicitud aceptada";
      const body = `${actorLabel} aceptó tu solicitud de seguimiento.`;
      const sharedMeta = {
        ...metadata,
        type: "follow_request_accepted",
        senderName: metadata.actorName,
        message: "aceptó tu solicitud de seguimiento",
        title,
        body,
        subject: title,
      };

      return {
        push: {
          title,
          body,
          data: {
            type: "follow_request_accepted",
            actorUserId: metadata.actorUserId,
            followId: metadata.followId || "",
          },
          metadata: sharedMeta,
        },
        inApp: {
          title,
          body,
          type: "follow_request_accepted",
          data: {
            actorUserId: metadata.actorUserId,
            followId: metadata.followId || "",
          },
          metadata: sharedMeta,
        },
        email: {
          template: "email/follow_social_notice.hbs",
          metadata: {
            ...sharedMeta,
            ctaText: "Ver perfil",
            link: metadata.profileLink || metadata.link || "",
          },
        },
      };
    },
  },

  FOLLOW_REQUEST_REJECTED: {
    triggerId: "FOLLOW_REQUEST_REJECTED",
    defaultChannels: ["push", "inApp"],
    required: ["userId", "actorUserId", "actorName"],
    build: ({ metadata }) => {
      const actorLabel = metadata.actorUsername
        ? `${metadata.actorName} (${metadata.actorUsername})`
        : metadata.actorName;

      return {
        push: {
          title: "Solicitud rechazada",
          body: `${actorLabel} rechazó tu solicitud de seguimiento.`,
          data: {
            type: "follow_request_rejected",
            actorUserId: metadata.actorUserId,
            followId: metadata.followId || "",
          },
          metadata: {
            ...metadata,
            type: "follow_request_rejected",
          },
        },
        inApp: {
          title: "Solicitud rechazada",
          body: `${actorLabel} rechazó tu solicitud de seguimiento.`,
          type: "follow_request_rejected",
          data: {
            actorUserId: metadata.actorUserId,
            followId: metadata.followId || "",
          },
          metadata: {
            ...metadata,
            type: "follow_request_rejected",
          },
        },
      };
    },
  },

  FEED_USER_MENTIONED: {
    triggerId: "FEED_USER_MENTIONED",
    defaultChannels: ["push", "inApp"],
    required: ["userId", "actorUserId", "actorName", "publicationId", "contextType"],
    build: ({ metadata }) => {
      const contextLabel =
        metadata.contextType === "comment"
          ? "comentario"
          : metadata.contextType === "repost"
            ? "repost"
            : "publicación";
      const preview = metadata.textPreview
        ? `: ${truncate(metadata.textPreview, 120)}`
        : ".";

      return {
        push: {
          title: `@ Mención en ${contextLabel}`,
          body: `${metadata.actorName} te mencionó en un ${contextLabel}${preview}`,
          data: {
            type: "feed_user_mentioned",
            publicationId: metadata.publicationId,
            commentId: metadata.commentId || "",
            contextType: metadata.contextType,
            actorUserId: metadata.actorUserId,
          },
          metadata: {
            ...metadata,
            type: "feed_user_mentioned",
          },
        },
        inApp: {
          title: `Te mencionaron`,
          body: `${metadata.actorName} te mencionó en un ${contextLabel}${preview}`,
          type: "feed_user_mentioned",
          data: {
            publicationId: metadata.publicationId,
            commentId: metadata.commentId || "",
            contextType: metadata.contextType,
            actorUserId: metadata.actorUserId,
          },
          metadata: {
            ...metadata,
            type: "feed_user_mentioned",
          },
        },
      };
    },
  },

  FEED_EVENT_MENTIONED: {
    triggerId: "FEED_EVENT_MENTIONED",
    defaultChannels: ["push", "inApp"],
    required: ["userId", "actorUserId", "actorName", "publicationId", "eventId", "eventName"],
    build: ({ metadata }) => ({
      push: {
        title: "@ Mención de evento",
        body: `${metadata.actorName} mencionó tu evento en una publicación: ${metadata.eventName}`,
        data: {
          type: "feed_event_mentioned",
          publicationId: metadata.publicationId,
          eventId: metadata.eventId,
          actorUserId: metadata.actorUserId,
        },
        metadata: {
          ...metadata,
          type: "feed_event_mentioned",
          message: "mencionó tu evento en una publicación",
          senderName: metadata.actorName,
          eventName: metadata.eventName,
        },
      },
      inApp: {
        title: "Mención de evento",
        body: `${metadata.actorName} mencionó tu evento en una publicación: ${metadata.eventName}`,
        type: "feed_event_mentioned",
        data: {
          publicationId: metadata.publicationId,
          eventId: metadata.eventId,
          actorUserId: metadata.actorUserId,
        },
        metadata: {
          ...metadata,
          type: "feed_event_mentioned",
          message: "mencionó tu evento en una publicación",
          senderName: metadata.actorName,
          eventName: metadata.eventName,
        },
      },
    }),
  },

  FEED_TARGET_LIKED_OWNER: {
    triggerId: "FEED_TARGET_LIKED_OWNER",
    defaultChannels: ["push", "inApp"],
    required: ["userId", "actorUserId", "actorName", "targetType", "targetId"],
    build: ({ metadata }) => {
      const targetLabel = metadata.targetType === "event" ? "evento" : "publicación";
      const body = metadata.targetTitle
        ? `${metadata.actorName} dio like a tu ${targetLabel}: ${metadata.targetTitle}`
        : `${metadata.actorName} dio like a tu ${targetLabel}.`;

      return {
        push: {
          title: `❤️ Nuevo like en tu ${targetLabel}`,
          body,
          data: {
            type: "feed_target_liked",
            targetType: metadata.targetType,
            targetId: metadata.targetId,
            publicationId: metadata.publicationId,
            eventId: metadata.eventId,
          },
          metadata: {
            ...metadata,
            type: "feed_target_liked",
          },
        },
        inApp: {
          title: `Nuevo like`,
          body,
          type: "feed_target_liked",
          data: {
            targetType: metadata.targetType,
            targetId: metadata.targetId,
            publicationId: metadata.publicationId,
            eventId: metadata.eventId,
          },
          metadata: {
            ...metadata,
            type: "feed_target_liked",
          },
        },
      };
    },
  },

  FEED_TARGET_COMMENTED_OWNER: {
    triggerId: "FEED_TARGET_COMMENTED_OWNER",
    defaultChannels: ["push", "inApp"],
    required: ["userId", "actorUserId", "actorName", "targetType", "targetId", "commentId"],
    build: ({ metadata }) => {
      const targetLabel = metadata.targetType === "event" ? "evento" : "publicación";
      const preview = metadata.commentText
        ? `“${truncate(metadata.commentText, 120)}”`
        : `Tienes un nuevo comentario en tu ${targetLabel}.`;

      return {
        push: {
          title: `💬 Nuevo comentario en tu ${targetLabel}`,
          body: `${metadata.actorName}: ${preview}`,
          data: {
            type: "feed_target_commented",
            targetType: metadata.targetType,
            targetId: metadata.targetId,
            commentId: metadata.commentId,
            parentCommentId: metadata.parentCommentId || "",
            publicationId: metadata.publicationId,
            eventId: metadata.eventId,
          },
          metadata: {
            ...metadata,
            type: "feed_target_commented",
          },
        },
        inApp: {
          title: `Nuevo comentario`,
          body: `${metadata.actorName}: ${preview}`,
          type: "feed_target_commented",
          data: {
            targetType: metadata.targetType,
            targetId: metadata.targetId,
            commentId: metadata.commentId,
            parentCommentId: metadata.parentCommentId || "",
            publicationId: metadata.publicationId,
            eventId: metadata.eventId,
          },
          metadata: {
            ...metadata,
            type: "feed_target_commented",
          },
        },
      };
    },
  },

  FEED_TARGET_REPOSTED_OWNER: {
    triggerId: "FEED_TARGET_REPOSTED_OWNER",
    defaultChannels: ["push", "inApp"],
    required: ["userId", "actorUserId", "actorName", "targetType", "targetId"],
    build: ({ metadata }) => {
      const body = metadata.targetTitle
        ? `${metadata.actorName} reposteó tu publicación: ${metadata.targetTitle}`
        : `${metadata.actorName} reposteó tu publicación.`;

      return {
        push: {
          title: `🔁 Nuevo repost`,
          body,
          data: {
            type: "feed_target_reposted",
            targetType: metadata.targetType,
            targetId: metadata.targetId,
            publicationId: metadata.publicationId,
            repostPublicationId: metadata.repostPublicationId,
          },
          metadata: {
            ...metadata,
            type: "feed_target_reposted",
          },
        },
        inApp: {
          title: `Repost de tu publicación`,
          body,
          type: "feed_target_reposted",
          data: {
            targetType: metadata.targetType,
            targetId: metadata.targetId,
            publicationId: metadata.publicationId,
            repostPublicationId: metadata.repostPublicationId,
          },
          metadata: {
            ...metadata,
            type: "feed_target_reposted",
          },
        },
      };
    },
  },

  FEED_COMMENT_REPLIED_OWNER: {
    triggerId: "FEED_COMMENT_REPLIED_OWNER",
    defaultChannels: ["push", "inApp"],
    required: ["userId", "actorUserId", "actorName", "targetType", "targetId", "commentId", "parentCommentId"],
    build: ({ metadata }) => {
      const preview = metadata.commentText
        ? `“${truncate(metadata.commentText, 120)}”`
        : `Tienes una nueva respuesta.`;

      return {
        push: {
          title: `↩️ Respondieron tu comentario`,
          body: `${metadata.actorName}: ${preview}`,
          data: {
            type: "feed_comment_replied",
            targetType: metadata.targetType,
            targetId: metadata.targetId,
            commentId: metadata.commentId,
            parentCommentId: metadata.parentCommentId,
            publicationId: metadata.publicationId,
            eventId: metadata.eventId,
          },
          metadata: {
            ...metadata,
            type: "feed_comment_replied",
          },
        },
        inApp: {
          title: `Nueva respuesta a tu comentario`,
          body: `${metadata.actorName}: ${preview}`,
          type: "feed_comment_replied",
          data: {
            targetType: metadata.targetType,
            targetId: metadata.targetId,
            commentId: metadata.commentId,
            parentCommentId: metadata.parentCommentId,
            publicationId: metadata.publicationId,
            eventId: metadata.eventId,
          },
          metadata: {
            ...metadata,
            type: "feed_comment_replied",
          },
        },
      };
    },
  },

  EVENT_PUBLISHED: {
    triggerId: "EVENT_PUBLISHED",
    defaultChannels: ["push", "email", "inApp"],
    required: ["userId", "eventName"],
    build: ({ metadata }) => {
      const formatDate = (dateStr) => {
        if (!dateStr || dateStr.length !== 8) return dateStr;
        return `${dateStr.substring(6, 8)}/${dateStr.substring(
          4,
          6,
        )}/${dateStr.substring(0, 4)}`;
      };

      const eventDateFormatted = formatDate(metadata.eventDate);
      const eventUrl = 
        `${WEB_APP_BASE_URL}/events/${metadata.eventId}`;

      return {
        push: {
          title: `✅ ${metadata.eventName} publicado exitosamente`,
          body: `Tu evento ya está visible para el público`,
          metadata: {
            userId: metadata.userId,
            eventName: metadata.eventName,
            eventId: metadata.eventId,
            eventSlug: metadata.eventSlug,
            type: "event_published",
          },
        },
        email: {
          template: "email/event_published.hbs",
          metadata: {
            title: `Tu evento ${metadata.eventName} está publicado`,
            eventName: metadata.eventName,
            eventDate: eventDateFormatted,
            eventLocation: metadata.eventLocation || "Por definir",
            organizerName: metadata.organizerName || "Organizador",
            eventUrl: eventUrl,
            eventSlug: metadata.eventSlug,
            ...metadata,
          },
        },
        inApp: {
          title: `🎉 Evento publicado`,
          body: `${metadata.eventName} ya está disponible públicamente`,
          metadata: {
            userId: metadata.userId,
            eventId: metadata.eventId,
            eventName: metadata.eventName,
            eventSlug: metadata.eventSlug,
            type: "event_published",
          },
        },
      };
    },
  },

  EVENT_STARTED_OWNER: {
    triggerId: "EVENT_STARTED_OWNER",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventId", "eventName"],
    build: ({ metadata }) => {
      const { eventLink, eventDateDisplay, eventTimeRange, eventLocation, eventAddress, eventImage, shared } =
        buildLifecyclePayload(metadata, "event_started_owner", {
          lifecycleStage: "STARTED",
          audience: "OWNER",
        });

      return {
        push: {
          title: `▶️ ${metadata.eventName} ya inició`,
          body: `Tu evento ya está en ejecución${eventTimeRange ? `. ${eventTimeRange}.` : "."}`,
          data: {
            ...shared,
            screen: "event_detail",
          },
          metadata: {
            ...metadata,
            ...shared,
          },
        },
        inApp: {
          title: "▶️ Evento en ejecución",
          body: `${metadata.eventName} ya inició${eventTimeRange ? `. ${eventTimeRange}.` : ""}`,
          data: {
            ...shared,
            screen: "event_detail",
          },
          metadata: {
            ...metadata,
            ...shared,
          },
        },
        email: {
          template: "email/event_lifecycle_notice.hbs",
          title: `Tu evento ${metadata.eventName} ya inició`,
          body: `${metadata.eventName} ya entró en ejecución. Revisa el detalle del evento en ${eventLink}`,
          metadata: {
            ...metadata,
            ...shared,
            title: `Tu evento ${metadata.eventName} ya inició`,
            subject: `Tu evento ${metadata.eventName} ya inició`,
            preheader: `${metadata.eventName} ya está en ejecución`,
            body: `${metadata.eventName} ya entró en ejecución. Revisa el detalle del evento en ${eventLink}`,
            badgeLabel: "Ciclo de vida del evento",
            headerTitle: "Evento en ejecución",
            introText: `Tu evento <strong>${metadata.eventName}</strong> ya inició. Consulta la información clave y mantén el control de la operación en tiempo real.`,
            ctaText: "Ver detalle del evento",
            link: eventLink,
            eventImage,
            eventDateDisplay,
            eventTimeRange,
            eventLocation,
            eventAddress,
            recommendationTitle: "Recomendaciones",
            recommendationItems: [
              "Mantén comunicación activa con tu staff y asistentes.",
              "Verifica accesos, horarios y novedades desde el detalle del evento.",
              "Confirma cualquier ajuste operativo antes del cierre del evento.",
            ],
          },
        },
      };
    },
  },

  EVENT_STARTED_BUYER: {
    triggerId: "EVENT_STARTED_BUYER",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventId", "eventName"],
    build: ({ metadata }) => {
      const { eventLink, eventDateDisplay, eventTimeRange, eventLocation, eventAddress, eventImage, shared } =
        buildLifecyclePayload(metadata, "event_started_buyer", {
          lifecycleStage: "STARTED",
          audience: "BUYER",
        });

      return {
        push: {
          title: `🎟️ ${metadata.eventName} ya inició`,
          body: `El evento al que asistirás ya está en ejecución${eventTimeRange ? `. ${eventTimeRange}.` : "."}`,
          data: {
            ...shared,
            screen: "event_detail",
          },
          metadata: {
            ...metadata,
            ...shared,
          },
        },
        inApp: {
          title: "🎟️ Evento en ejecución",
          body: `${metadata.eventName} ya inició${eventTimeRange ? `. ${eventTimeRange}.` : ""}`,
          data: {
            ...shared,
            screen: "event_detail",
          },
          metadata: {
            ...metadata,
            ...shared,
          },
        },
        email: {
          template: "email/event_lifecycle_notice.hbs",
          title: `${metadata.eventName} ya inició`,
          body: `El evento ${metadata.eventName} ya está en ejecución. Puedes revisar la información en ${eventLink}`,
          metadata: {
            ...metadata,
            ...shared,
            title: `${metadata.eventName} ya inició`,
            subject: `${metadata.eventName} ya inició`,
            preheader: `Ya puedes ingresar al evento ${metadata.eventName}`,
            body: `El evento ${metadata.eventName} ya está en ejecución. Puedes revisar la información en ${eventLink}`,
            badgeLabel: "Evento en curso",
            headerTitle: "Tu evento ya inició",
            introText: `El evento <strong>${metadata.eventName}</strong> ya está en ejecución. Consulta aquí la información de ingreso y ubicación.`,
            ctaText: "Ver detalle del evento",
            link: eventLink,
            eventImage,
            eventDateDisplay,
            eventTimeRange,
            eventLocation,
            eventAddress,
            recommendationTitle: "Recomendaciones",
            recommendationItems: [
              "Ten tu dispositivo con suficiente batería.",
              "Llega con anticipación al lugar del evento.",
              "Revisa el detalle para confirmar horario y ubicación exacta.",
            ],
          },
        },
      };
    },
  },

  EVENT_TICKET_SALES_REMINDER_OWNER: {
    triggerId: "EVENT_TICKET_SALES_REMINDER_OWNER",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventId", "eventName"],
    build: ({ metadata }) => {
      const { eventLink, eventLocation, eventAddress, eventImage, saleStartDateDisplay, saleStartTime, saleCountdownText, shared } =
        buildTicketSalesPayload(metadata, "event_ticket_sales_reminder_owner", {
          ticketSalesPhase: "REMINDER",
          audience: "OWNER",
        });

      return buildTicketSalesNotificationContent({
        metadata,
        shared,
        eventLink,
        eventLocation,
        eventAddress,
        eventImage,
        title: `⏳ La venta de ${metadata.eventName} empieza pronto`,
        inAppTitle: "⏳ Venta próxima a iniciar",
        emailSubject: `La venta de ${metadata.eventName} inicia pronto`,
        emailTitle: `La venta de ${metadata.eventName} inicia pronto`,
        badgeLabel: "Venta de tickets",
        headerTitle: "Ventas por iniciar",
        introText: `La venta de tickets para <strong>${metadata.eventName}</strong> comenzará el <strong>${saleStartDateDisplay}</strong>${saleStartTime ? ` a las <strong>${saleStartTime}</strong>` : ""}${saleCountdownText ? `. Faltan <strong>${saleCountdownText}</strong>.` : "."}`,
        pushBody: `Inicia el ${saleStartDateDisplay}${saleStartTime ? ` a las ${saleStartTime}` : ""}${saleCountdownText ? `. Faltan ${saleCountdownText}.` : "."}`,
        inAppBody: `${metadata.eventName} abrirá ventas el ${saleStartDateDisplay}${saleStartTime ? ` a las ${saleStartTime}` : ""}${saleCountdownText ? `. Faltan ${saleCountdownText}.` : ""}`,
        eventDateDisplay: saleStartDateDisplay,
        eventTimeRange: saleStartTime ? `Inicio a las ${saleStartTime}` : "Horario por confirmar",
        detailsSectionTitle: "Venta de tickets",
        dateLabel: "Fecha de apertura",
        timeLabel: "Hora de apertura",
        locationLabel: "Ubicación del evento",
        recommendationItems: buildTicketSalesRecommendationItems("reminder_owner"),
      });
    },
  },

  EVENT_TICKET_SALES_REMINDER_AUDIENCE: {
    triggerId: "EVENT_TICKET_SALES_REMINDER_AUDIENCE",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventId", "eventName"],
    build: ({ metadata }) => {
      const { eventLink, eventLocation, eventAddress, eventImage, saleStartDateDisplay, saleStartTime, saleCountdownText, shared } =
        buildTicketSalesPayload(metadata, "event_ticket_sales_reminder_audience", {
          ticketSalesPhase: "REMINDER",
          audience: "AUDIENCE",
        });

      return buildTicketSalesNotificationContent({
        metadata,
        shared,
        eventLink,
        eventLocation,
        eventAddress,
        eventImage,
        title: `🎫 ${metadata.eventName} abrirá ventas pronto`,
        inAppTitle: "🎫 Venta próxima",
        emailSubject: `Pronto inicia la venta de ${metadata.eventName}`,
        emailTitle: `Pronto inicia la venta de ${metadata.eventName}`,
        badgeLabel: "Venta de tickets",
        headerTitle: "Entradas disponibles pronto",
        introText: `Las entradas para <strong>${metadata.eventName}</strong> estarán disponibles el <strong>${saleStartDateDisplay}</strong>${saleStartTime ? ` a las <strong>${saleStartTime}</strong>` : ""}${saleCountdownText ? `. Faltan <strong>${saleCountdownText}</strong>.` : "."}`,
        pushBody: `Disponibles el ${saleStartDateDisplay}${saleStartTime ? ` a las ${saleStartTime}` : ""}${saleCountdownText ? `. Faltan ${saleCountdownText}.` : "."}`,
        inAppBody: `${metadata.eventName} abrirá ventas el ${saleStartDateDisplay}${saleStartTime ? ` a las ${saleStartTime}` : ""}${saleCountdownText ? `. Faltan ${saleCountdownText}.` : ""}`,
        eventDateDisplay: saleStartDateDisplay,
        eventTimeRange: saleStartTime ? `Inicio a las ${saleStartTime}` : "Horario por confirmar",
        detailsSectionTitle: "Venta de tickets",
        dateLabel: "Fecha de apertura",
        timeLabel: "Hora de apertura",
        locationLabel: "Ubicación del evento",
        recommendationItems: buildTicketSalesRecommendationItems("reminder_audience"),
      });
    },
  },

  EVENT_TICKET_SALES_STARTED_OWNER: {
    triggerId: "EVENT_TICKET_SALES_STARTED_OWNER",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventId", "eventName"],
    build: ({ metadata }) => {
      const { eventLink, eventLocation, eventAddress, eventImage, saleEndDateDisplay, saleEndTime, shared } =
        buildTicketSalesPayload(metadata, "event_ticket_sales_started_owner", {
          ticketSalesPhase: "STARTED",
          audience: "OWNER",
        });

      return buildTicketSalesNotificationContent({
        metadata,
        shared,
        eventLink,
        eventLocation,
        eventAddress,
        eventImage,
        title: `▶️ La venta de ${metadata.eventName} ya inició`,
        inAppTitle: "▶️ Venta de tickets activa",
        emailSubject: `La venta de ${metadata.eventName} ya inició`,
        emailTitle: `La venta de ${metadata.eventName} ya inició`,
        badgeLabel: "Venta de tickets activa",
        headerTitle: "Ventas abiertas",
        introText: `La venta de tickets para <strong>${metadata.eventName}</strong> ya está activa.`,
        pushBody: `Las entradas ya están disponibles${saleEndDateDisplay ? `. Cierre ${saleEndDateDisplay}` : ""}${saleEndTime ? ` a las ${saleEndTime}` : ""}.`,
        inAppBody: `${metadata.eventName} ya tiene ventas activas.`,
        eventDateDisplay: saleEndDateDisplay || formatEventDate(metadata.saleStartDate),
        eventTimeRange: saleEndTime ? `Cierre a las ${saleEndTime}` : "Ventas activas",
        detailsSectionTitle: "Venta de tickets",
        dateLabel: "Fecha de cierre",
        timeLabel: "Hora de cierre",
        locationLabel: "Ubicación del evento",
        recommendationItems: buildTicketSalesRecommendationItems("started_owner"),
      });
    },
  },

  EVENT_TICKET_SALES_STARTED_AUDIENCE: {
    triggerId: "EVENT_TICKET_SALES_STARTED_AUDIENCE",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventId", "eventName"],
    build: ({ metadata }) => {
      const { eventLink, eventLocation, eventAddress, eventImage, saleEndDateDisplay, saleEndTime, shared } =
        buildTicketSalesPayload(metadata, "event_ticket_sales_started_audience", {
          ticketSalesPhase: "STARTED",
          audience: "AUDIENCE",
        });

      return buildTicketSalesNotificationContent({
        metadata,
        shared,
        eventLink,
        eventLocation,
        eventAddress,
        eventImage,
        title: `🎟️ Ya puedes comprar ${metadata.eventName}`,
        inAppTitle: "🎟️ Entradas disponibles",
        emailSubject: `Ya inició la venta de ${metadata.eventName}`,
        emailTitle: `Ya inició la venta de ${metadata.eventName}`,
        badgeLabel: "Venta de tickets activa",
        headerTitle: "Entradas ya disponibles",
        introText: `La venta de tickets para <strong>${metadata.eventName}</strong> ya comenzó.`,
        pushBody: `La venta ya inició${saleEndDateDisplay ? `. Cierra ${saleEndDateDisplay}` : ""}${saleEndTime ? ` a las ${saleEndTime}` : ""}.`,
        inAppBody: `Las entradas de ${metadata.eventName} ya están disponibles.`,
        eventDateDisplay: saleEndDateDisplay || formatEventDate(metadata.saleStartDate),
        eventTimeRange: saleEndTime ? `Cierre a las ${saleEndTime}` : "Ventas activas",
        detailsSectionTitle: "Venta de tickets",
        dateLabel: "Fecha de cierre",
        timeLabel: "Hora de cierre",
        locationLabel: "Ubicación del evento",
        recommendationItems: buildTicketSalesRecommendationItems("started_audience"),
      });
    },
  },

  EVENT_TICKET_SALES_ENDING_SOON_OWNER: {
    triggerId: "EVENT_TICKET_SALES_ENDING_SOON_OWNER",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventId", "eventName"],
    build: ({ metadata }) => {
      const { eventLink, eventLocation, eventAddress, eventImage, saleEndDateDisplay, saleEndTime, saleCountdownText, shared } =
        buildTicketSalesPayload(metadata, "event_ticket_sales_ending_soon_owner", {
          ticketSalesPhase: "ENDING_SOON",
          audience: "OWNER",
        });

      return buildTicketSalesNotificationContent({
        metadata,
        shared,
        eventLink,
        eventLocation,
        eventAddress,
        eventImage,
        title: `⏰ La venta de ${metadata.eventName} está por cerrar`,
        inAppTitle: "⏰ Venta próxima a cerrar",
        emailSubject: `La venta de ${metadata.eventName} está por cerrar`,
        emailTitle: `La venta de ${metadata.eventName} está por cerrar`,
        badgeLabel: "Última hora de venta",
        headerTitle: "Cierre próximo",
        introText: `${saleCountdownText ? `Quedan <strong>${saleCountdownText}</strong>` : 'Queda menos de una hora'} para que finalice la venta de tickets de <strong>${metadata.eventName}</strong>.`,
        pushBody: `${saleCountdownText ? `Quedan ${saleCountdownText}` : 'Queda 1 hora o menos'} para finalizar la venta.`,
        inAppBody: `${saleCountdownText ? `Quedan ${saleCountdownText}` : 'Queda 1 hora o menos'} para el cierre de ${metadata.eventName}.`,
        eventDateDisplay: saleEndDateDisplay,
        eventTimeRange: saleEndTime ? `Cierra a las ${saleEndTime}` : "Cierre próximo",
        detailsSectionTitle: "Venta de tickets",
        dateLabel: "Fecha de cierre",
        timeLabel: "Hora de cierre",
        locationLabel: "Ubicación del evento",
        recommendationItems: buildTicketSalesRecommendationItems("ending_soon_owner"),
      });
    },
  },

  EVENT_TICKET_SALES_ENDING_SOON_AUDIENCE: {
    triggerId: "EVENT_TICKET_SALES_ENDING_SOON_AUDIENCE",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventId", "eventName"],
    build: ({ metadata }) => {
      const { eventLink, eventLocation, eventAddress, eventImage, saleEndDateDisplay, saleEndTime, saleCountdownText, shared } =
        buildTicketSalesPayload(metadata, "event_ticket_sales_ending_soon_audience", {
          ticketSalesPhase: "ENDING_SOON",
          audience: "AUDIENCE",
        });

      return buildTicketSalesNotificationContent({
        metadata,
        shared,
        eventLink,
        eventLocation,
        eventAddress,
        eventImage,
        title: `⏰ Última oportunidad para ${metadata.eventName}`,
        inAppTitle: "⏰ Venta a punto de cerrar",
        emailSubject: `Última oportunidad para comprar ${metadata.eventName}`,
        emailTitle: `Última oportunidad para comprar ${metadata.eventName}`,
        badgeLabel: "Última hora de venta",
        headerTitle: "Compra antes del cierre",
        introText: `${saleCountdownText ? `Quedan <strong>${saleCountdownText}</strong>` : 'Queda menos de una hora'} para que finalice la venta de tickets de <strong>${metadata.eventName}</strong>.`,
        pushBody: `${saleCountdownText ? `Quedan ${saleCountdownText}` : 'Queda 1 hora o menos'} para comprar entradas.`,
        inAppBody: `${saleCountdownText ? `Quedan ${saleCountdownText}` : 'Queda 1 hora o menos'} para comprar tickets de ${metadata.eventName}.`,
        eventDateDisplay: saleEndDateDisplay,
        eventTimeRange: saleEndTime ? `Cierra a las ${saleEndTime}` : "Cierre próximo",
        detailsSectionTitle: "Venta de tickets",
        dateLabel: "Fecha de cierre",
        timeLabel: "Hora de cierre",
        locationLabel: "Ubicación del evento",
        recommendationItems: buildTicketSalesRecommendationItems("ending_soon_audience"),
      });
    },
  },

  EVENT_TICKET_SALES_FINISHED_OWNER: {
    triggerId: "EVENT_TICKET_SALES_FINISHED_OWNER",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventId", "eventName"],
    build: ({ metadata }) => {
      const { eventLink, eventLocation, eventAddress, eventImage, saleEndDateDisplay, saleEndTime, shared } =
        buildTicketSalesPayload(metadata, "event_ticket_sales_finished_owner", {
          ticketSalesPhase: "FINISHED",
          audience: "OWNER",
        });

      return buildTicketSalesNotificationContent({
        metadata,
        shared,
        eventLink,
        eventLocation,
        eventAddress,
        eventImage,
        title: `✅ La venta de ${metadata.eventName} finalizó`,
        inAppTitle: "✅ Venta finalizada",
        emailSubject: `La venta de ${metadata.eventName} finalizó`,
        emailTitle: `La venta de ${metadata.eventName} finalizó`,
        badgeLabel: "Venta de tickets finalizada",
        headerTitle: "Venta finalizada",
        introText: `La venta de tickets para <strong>${metadata.eventName}</strong> ha finalizado.`,
        pushBody: `La venta cerró${saleEndDateDisplay ? ` el ${saleEndDateDisplay}` : ""}${saleEndTime ? ` a las ${saleEndTime}` : ""}.`,
        inAppBody: `La venta de tickets de ${metadata.eventName} ya finalizó.`,
        eventDateDisplay: saleEndDateDisplay,
        eventTimeRange: saleEndTime ? `Finalizó a las ${saleEndTime}` : "Venta cerrada",
        detailsSectionTitle: "Venta de tickets",
        dateLabel: "Fecha de cierre",
        timeLabel: "Hora de cierre",
        locationLabel: "Ubicación del evento",
        recommendationItems: buildTicketSalesRecommendationItems("finished_owner"),
      });
    },
  },

  EVENT_TICKET_SALES_FINISHED_AUDIENCE: {
    triggerId: "EVENT_TICKET_SALES_FINISHED_AUDIENCE",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventId", "eventName"],
    build: ({ metadata }) => {
      const { eventLink, eventLocation, eventAddress, eventImage, saleEndDateDisplay, saleEndTime, shared } =
        buildTicketSalesPayload(metadata, "event_ticket_sales_finished_audience", {
          ticketSalesPhase: "FINISHED",
          audience: "AUDIENCE",
        });

      return buildTicketSalesNotificationContent({
        metadata,
        shared,
        eventLink,
        eventLocation,
        eventAddress,
        eventImage,
        title: `✅ Finalizó la venta de ${metadata.eventName}`,
        inAppTitle: "✅ Venta finalizada",
        emailSubject: `Finalizó la venta de ${metadata.eventName}`,
        emailTitle: `Finalizó la venta de ${metadata.eventName}`,
        badgeLabel: "Venta de tickets finalizada",
        headerTitle: "Venta cerrada",
        introText: `La venta de tickets para <strong>${metadata.eventName}</strong> ya finalizó.`,
        pushBody: `La venta cerró${saleEndDateDisplay ? ` el ${saleEndDateDisplay}` : ""}${saleEndTime ? ` a las ${saleEndTime}` : ""}.`,
        inAppBody: `La venta de tickets de ${metadata.eventName} ya ha terminado.`,
        eventDateDisplay: saleEndDateDisplay,
        eventTimeRange: saleEndTime ? `Finalizó a las ${saleEndTime}` : "Venta cerrada",
        detailsSectionTitle: "Venta de tickets",
        dateLabel: "Fecha de cierre",
        timeLabel: "Hora de cierre",
        locationLabel: "Ubicación del evento",
        recommendationItems: buildTicketSalesRecommendationItems("finished_audience"),
      });
    },
  },

  EVENT_TICKET_SALES_SUMMARY_OWNER: {
    triggerId: "EVENT_TICKET_SALES_SUMMARY_OWNER",
    defaultChannels: ["email"],
    required: ["userId", "eventId", "eventName"],
    build: ({ metadata }) => {
      const { eventLink, eventLocation, eventAddress, eventImage, shared } =
        buildTicketSalesPayload(metadata, "event_ticket_sales_summary_owner", {
          ticketSalesPhase: "SUMMARY",
          audience: "OWNER",
        });

      return {
        email: {
          template: "email/event_lifecycle_notice.hbs",
          metadata: {
            ...metadata,
            ...shared,
            subject: `Resumen de ventas de ${metadata.eventName}`,
            title: `Resumen de ventas de ${metadata.eventName}`,
            badgeLabel: "Resumen comercial",
            headerTitle: "Cierre de ventas",
            introText: `Este es el resumen final de ventas para <strong>${metadata.eventName}</strong>.`,
            ctaText: "Ver detalle del evento",
            link: eventLink,
            eventImage,
            eventDateDisplay: formatEventDate(metadata.saleEndDate || metadata.eventDate),
            eventTimeRange: metadata.saleEndTime ? `Cierre a las ${metadata.saleEndTime}` : "Venta finalizada",
            eventLocation,
            eventAddress,
            detailsSectionTitle: "Resumen de ventas",
            dateLabel: "Fecha de cierre",
            timeLabel: "Hora de cierre",
            locationLabel: "Ubicación del evento",
            recommendationTitle: "Recomendaciones",
            recommendationItems: buildTicketSalesRecommendationItems("summary_owner"),
            summaryStats: metadata.summaryStats || [
              { label: 'Órdenes aprobadas', value: String(metadata.totalOrdersFormatted || metadata.totalOrders || 0) },
              { label: 'Tickets vendidos', value: String(metadata.soldTicketsFormatted || metadata.soldTickets || 0) },
              { label: 'Ingresos generados', value: metadata.totalRevenueFormatted || (metadata.totalRevenue !== undefined ? `${metadata.currency ? metadata.currency + ' ' : ''}${metadata.totalRevenue}` : '0') },
            ],
          },
        },
      };
    },
  },

  EVENT_FINISHED: {
    triggerId: "EVENT_FINISHED",
    defaultChannels: ["push", "inApp", "email", "whatsapp"],
    required: ["userId", "eventId", "eventName"],
    build: ({ metadata }) => {
      const { eventLink, eventDateDisplay, eventTimeRange, eventLocation, eventAddress, eventImage, shared } =
        buildLifecyclePayload(metadata, "event_finished", {
          lifecycleStage: "FINISHED",
          audience: metadata.audience || "ATTENDEE",
          eventEndDate: formatEventDate(metadata.eventEndDate || metadata.eventDate),
        });
      const eventEndDate = formatEventDate(metadata.eventEndDate || metadata.eventDate);

      return {
        push: {
          title: `✅ ${metadata.eventName} ha finalizado`,
          body: `Gracias por asistir. Ya puedes revisar el resumen del evento.`,
          data: {
            ...shared,
            screen: "event_detail",
          },
          metadata: {
            ...metadata,
            ...shared,
            eventEndDate,
          },
        },
        inApp: {
          title: `✅ Evento finalizado`,
          body: `${metadata.eventName} ha terminado. Toca para ver los detalles del evento.`,
          data: {
            ...shared,
            screen: "event_detail",
          },
          metadata: {
            ...metadata,
            ...shared,
            eventEndDate,
          },
        },
        email: {
          template: "email/event_lifecycle_notice.hbs",
          metadata: {
            ...metadata,
            ...shared,
            title: `Evento finalizado: ${metadata.eventName}`,
            subject: `Evento finalizado: ${metadata.eventName}`,
            preheader: `${metadata.eventName} ha finalizado`,
            body: `${metadata.eventName} ha finalizado.`,
            eventEndDate,
            eventEndTime: metadata.eventEndTime || "",
            link: eventLink,
            userName: metadata.userName || "Usuario",
            eventImage,
            eventDateDisplay: eventEndDate || eventDateDisplay,
            eventTimeRange,
            eventLocation,
            eventAddress,
            badgeLabel: "Evento finalizado",
            headerTitle: "Gracias por participar",
            introText: `El evento <strong>${metadata.eventName}</strong> ha finalizado. Puedes volver al detalle del evento y consultar su información relacionada.`,
            ctaText: "Ver detalle del evento",
            recommendationTitle: "Siguiente paso",
            recommendationItems: [
              "Consulta la información final y cualquier actualización del evento.",
              "Si asististe, revisa tu experiencia antes de dejar tu calificación.",
            ],
          },
        },
        whatsapp: {
          template: "whatsapp/event_finished.js",
          templateName: "event_finished",
          metadata: {
            userName: metadata.userName || "Usuario",
            eventName: metadata.eventName,
            eventId: metadata.eventId,
            eventImage: metadata.eventImage,
            languageCode: "es",
            link: eventLink,
            ...metadata,
          },
        },
      };
    },
  },

  EVENT_FINISHED_OWNER: {
    triggerId: "EVENT_FINISHED_OWNER",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventId", "eventName"],
    build: ({ metadata }) => {
      const { eventLink, eventDateDisplay, eventTimeRange, eventLocation, eventAddress, eventImage, shared } =
        buildLifecyclePayload(metadata, "event_finished_owner", {
          lifecycleStage: "FINISHED",
          audience: "OWNER",
          eventEndDate: formatEventDate(metadata.eventEndDate || metadata.eventDate),
        });
      const eventEndDate = formatEventDate(metadata.eventEndDate || metadata.eventDate);

      return {
        push: {
          title: `🏁 ${metadata.eventName} finalizó`,
          body: `Tu evento terminó${eventTimeRange ? `. ${eventTimeRange}.` : "."}`,
          data: {
            ...shared,
            screen: "event_detail",
          },
          metadata: {
            ...metadata,
            ...shared,
            eventEndDate,
          },
        },
        inApp: {
          title: "🏁 Evento finalizado",
          body: `${metadata.eventName} ya terminó${eventTimeRange ? `. ${eventTimeRange}.` : ""}`,
          data: {
            ...shared,
            screen: "event_detail",
          },
          metadata: {
            ...metadata,
            ...shared,
            eventEndDate,
          },
        },
        email: {
          template: "email/event_lifecycle_notice.hbs",
          metadata: {
            ...metadata,
            ...shared,
            title: `Tu evento ${metadata.eventName} ha finalizado`,
            subject: `Tu evento ${metadata.eventName} ha finalizado`,
            preheader: `${metadata.eventName} ya terminó`,
            body: `${metadata.eventName} ha finalizado. Revisa el cierre del evento en ${eventLink}`,
            eventEndDate,
            eventEndTime: metadata.eventEndTime || "",
            link: eventLink,
            eventImage,
            eventDateDisplay: eventEndDate || eventDateDisplay,
            eventTimeRange,
            eventLocation,
            eventAddress,
            badgeLabel: "Ciclo de vida del evento",
            headerTitle: "Evento finalizado",
            introText: `Tu evento <strong>${metadata.eventName}</strong> ha finalizado. Revisa la información de cierre y las métricas disponibles del evento.`,
            ctaText: "Ver detalle del evento",
            recommendationTitle: "Siguiente paso",
            recommendationItems: [
              "Revisa ventas, ingresos y comportamiento de invitados.",
              "Consulta comentarios o calificaciones posteriores al evento.",
              "Confirma cualquier gestión pendiente de cierre operativo.",
            ],
          },
        },
      };
    },
  },

  EVENT_RATE_REQUEST: {
    triggerId: "EVENT_RATE_REQUEST",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventId", "eventName"],
    build: ({ metadata }) => {
      const { eventLink, eventDateDisplay, eventTimeRange, eventLocation, eventAddress, eventImage, shared } =
        buildLifecyclePayload(metadata, "event_rate_request", {
          lifecycleStage: "RATING_REQUEST",
          audience: metadata.audience || "ATTENDEE",
        });

      const rateEventLink = metadata.eventId
        ? `${EVENT_DETAIL_BASE_URL}?eventId=${metadata.eventId}&rateEvent=true`
        : eventLink;

      return {
        push: {
          title: `⭐ ¿Cómo estuvo ${metadata.eventName}?`,
          body: `Ya puedes calificar el evento. ¡Tu opinión nos importa!`,
          data: {
            ...shared,
            screen: "event_rating",
            rateEvent: true,
          },
          metadata: {
            ...metadata,
            ...shared,
          },
        },
        inApp: {
          title: `⭐ Califica tu experiencia`,
          body: `¿Cómo estuvo ${metadata.eventName}? Toca para calificar el evento.`,
          data: {
            ...shared,
            screen: "event_rating",
            rateEvent: true,
          },
          metadata: {
            ...metadata,
            ...shared,
          },
        },
        email: {
          template: "email/event_lifecycle_notice.hbs",
          metadata: {
            ...metadata,
            ...shared,
            subject: `⭐ ¿Cómo estuvo ${metadata.eventName}? Califica tu experiencia`,
            preheader: `Tu opinión sobre ${metadata.eventName} nos importa`,
            title: `Califica tu experiencia en ${metadata.eventName}`,
            body: `Tu opinión sobre ${metadata.eventName} nos ayuda a mejorar la experiencia de la comunidad DoEvents.`,
            link: rateEventLink,
            eventImage,
            eventDateDisplay,
            eventTimeRange,
            eventLocation,
            eventAddress,
            badgeLabel: "Calificación del evento",
            headerTitle: "Tu opinión nos importa",
            introText: `Ayúdanos a mejorar calificando tu experiencia en <strong>${metadata.eventName}</strong>.`,
            ctaText: "Calificar evento",
            recommendationTitle: "Tu valoración ayuda a",
            recommendationItems: [
              "Mejorar la experiencia para futuros asistentes.",
              "Dar retroalimentación clara al organizador del evento.",
              "Mantener la calidad de la comunidad DoEvents.",
            ],
          },
        },
      };
    },
  },

  EVENT_CALIFICATION_RECEIVED: {
    triggerId: "EVENT_CALIFICATION_RECEIVED",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventId", "eventName"],
    build: ({ metadata }) => {
      const eventLink =
        metadata.link ||
        `${WEB_APP_BASE_URL}/events/${metadata.eventId}`;
      const stars = "⭐".repeat(Math.max(1, Math.min(5, Math.round(metadata.rating || 5))));

      return {
        push: {
          title: `${stars} Nueva calificación en ${metadata.eventName}`,
          body: metadata.comment
            ? `"${String(metadata.comment).slice(0, 80)}"` 
            : `Alguien calificó tu evento con ${metadata.rating} estrellas.`,
          data: {
            eventId: metadata.eventId,
            eventName: metadata.eventName,
            type: "event_calification_received",
          },
          metadata: {
            userId: metadata.userId,
            eventId: metadata.eventId,
            eventName: metadata.eventName,
            link: eventLink,
            type: "event_calification_received",
          },
        },
        inApp: {
          title: `${stars} Recibiste una calificación`,
          body: metadata.comment
            ? `${metadata.reviewerName || "Un asistente"} comentó: "${String(metadata.comment).slice(0, 100)}"`
            : `${metadata.reviewerName || "Un asistente"} calificó tu evento con ${metadata.rating} estrella${metadata.rating !== 1 ? "s" : ""}.`,
          data: {
            eventId: metadata.eventId,
            eventName: metadata.eventName,
            type: "event_calification_received",
          },
          metadata: {
            userId: metadata.userId,
            eventId: metadata.eventId,
            eventName: metadata.eventName,
            link: eventLink,
            type: "event_calification_received",
          },
        },
        email: {
          template: "email/event_calification_received.hbs",
          metadata: {
            subject: `${stars} Nueva calificación para tu evento: ${metadata.eventName}`,
            preheader: `${metadata.reviewerName || "Un asistente"} calificó tu evento`,
            year: new Date().getFullYear(),
            eventName: metadata.eventName,
            eventId: metadata.eventId,
            userId: metadata.userId,
            userName: metadata.userName || metadata.organizerName || "",
            reviewerName: metadata.reviewerName || "Un asistente",
            rating: metadata.rating,
            stars,
            comment: metadata.comment || null,
            eventImage: metadata.eventImage,
            link: eventLink,
            type: "event_calification_received",
            ...metadata,
          },
        },
      };
    },
  },

  EVENT_INVITATION: {
    triggerId: "EVENT_INVITATION",
    defaultChannels: ["push", "inApp", "email", "whatsapp"],
    required: ["userId", "eventId", "eventName", "inviterName"],
    build: ({ metadata }) => {
      const eventLink =
        metadata.link ||
        `${WEB_APP_BASE_URL}/events/${metadata.eventId}`;
      const eventShareLink =
        metadata.shareLink ||
        `${WEB_APP_BASE_URL}/events/${metadata.eventId}`;
      const primaryLink = eventShareLink || eventLink;
      const hasHost = Boolean(
        metadata.hostName || metadata.hostImage || metadata.hostId,
      );
      const formattedEventDate = formatEventDate(metadata.eventDate);

      return {
        push: {
        title: `Invitación a ${metadata.eventName}`,
        body: `${metadata.inviterName} te ha invitado al evento ${
          metadata.eventName
        }${metadata.eventDate ? ` - ${metadata.eventDate}` : ""}`,
        metadata: {
          userId: metadata.userId,
          eventId: metadata.eventId,
          eventName: metadata.eventName,
          inviterName: metadata.inviterName,
          link: primaryLink,
          detailLink: eventLink,
          shareLink: eventShareLink,
          type: "invitacion_evento",
        },
      },
      inApp: {
        title: `Nueva invitación: ${metadata.eventName}`,
        body: `${metadata.inviterName} te ha invitado a unirte a este evento${
          metadata.message ? `: "${metadata.message}"` : ""
        }`,
        metadata: {
          userId: metadata.userId,
          eventId: metadata.eventId,
          eventName: metadata.eventName,
          inviterName: metadata.inviterName,
          link: primaryLink,
          detailLink: eventLink,
          shareLink: eventShareLink,
          eventDate: formattedEventDate,
          eventLocation: metadata.eventLocation,
          type: "event_invitation",
        },
      },
      email: {
        template: "email/event_invitation.hbs",
        title: `Invitación al evento: ${metadata.eventName}`,
        body: `${metadata.inviterName} te invitó a ${metadata.eventName}`,
        metadata: {
          ...metadata,
          subject: `Invitación al evento: ${metadata.eventName}`,
          preheader: `${metadata.inviterName} te invitó a unirte`,
          year: new Date().getFullYear(),
          eventName: metadata.eventName,
          inviterName: metadata.inviterName,
          organizerName: metadata.organizerName || metadata.inviterName,
          organizerImage: metadata.organizerImage || metadata.inviterImage || "",
          organizerRole: metadata.organizerRole || "Organizador",
          hasHost,
          hostName: hasHost ? metadata.hostName || "" : "",
          hostImage: hasHost ? metadata.hostImage || "" : "",
          hostRole: hasHost ? metadata.hostRole || "Anfitrion" : "",
          eventDateDisplay: formattedEventDate || "",
          eventDate: formattedEventDate || "",
          eventStartTime: metadata.eventStartTime || "",
          eventEndTime: metadata.eventEndTime || "",
          eventLocation: metadata.eventLocation || "",
          eventAddress: metadata.eventAddress || "",
          eventCity: metadata.eventCity || "",
          eventImage: metadata.eventImage || "",
          message: metadata.message || "",
          link: primaryLink,
          detailLink: eventLink,
          shareLink: eventShareLink,
          buttonText: "Ver evento",
        },
      },
      whatsapp: {
        template: "whatsapp/event_invitation.js",
        templateName: "evento_compartido",
        metadata: {
          title: `Invitación a evento`,
          body: `${metadata.inviterName} te invitó a ${metadata.eventName}`,
          eventName: metadata.eventName,
          inviterName: metadata.inviterName,
          favoriteUserName: metadata.favoriteUserName || "Usuario",
          eventId: metadata.eventId,
          eventSlug: metadata.eventSlug || metadata.eventId,
          eventImage: metadata.eventImage || null,
          languageCode: "es",
          eventDate: metadata.eventDate || "",
          eventStartTime: metadata.eventStartTime || "",
          eventLocation: metadata.eventLocation || "",
          eventCity: metadata.eventCity || "",
          message: metadata.message || "",
          ...metadata,
          link: primaryLink,
          detailLink: eventLink,
          shareLink: eventShareLink,
        },
      },
      };
    },
  },

  // ────────── Ticket Transfer Notifications ──────────
  TICKET_TRANSFERRED_RECEIVED: {
    triggerId: "TICKET_TRANSFERRED_RECEIVED",
    defaultChannels: ["inApp", "push", "email", "whatsapp"],
    required: ["userId", "senderName", "eventName", "ticketCount"],
    build: ({ metadata }) => ({
      inApp: {
        title: `Has recibido ${metadata.ticketCount} boleta(s)`,
        body: `${metadata.senderName} te ha transferido boletas para ${metadata.eventName}`,
        metadata: {
          userId: metadata.userId,
          eventId: metadata.eventId,
          orderID: metadata.orderID,
          type: "ticket_transferred",
        },
      },
      push: {
        title: `🎫 Boletas recibidas`,
        body: `${metadata.senderName} te transfirió ${metadata.ticketCount} boleta(s) para ${metadata.eventName}`,
        metadata: {
          userId: metadata.userId,
          eventId: metadata.eventId,
          orderID: metadata.orderID,
          type: "ticket_transferred",
        },
      },
      email: {
        template: "email/ticket_transferred_received.hbs",
        metadata: {
          title: `Boletas recibidas - ${metadata.eventName}`,
          body: `${metadata.senderName} te ha transferido boletas`,
          viewTicketsLink: metadata.ticketViewLink
            || metadata.viewTicketsLink
            || `https://dev.doeventsapp.com/tickets/${encodeURIComponent(metadata.orderID || "")}`,
          ...metadata,
        },
      },
      whatsapp: {
        template: "whatsapp/ticket_transferred_received.js",
        templateName: "tickets_transferred_received",
        metadata: {
          title: `Boletas recibidas`,
          body: `${metadata.senderName} te transfirió ${metadata.ticketCount} boleta(s) para ${metadata.eventName}`,
          ...metadata,
        },
      },
    }),
  },

  TICKET_TRANSFERRED_SENT: {
    triggerId: "TICKET_TRANSFERRED_SENT",
    defaultChannels: ["inApp", "push", "email", "whatsapp"],
    required: ["userId", "receiverName", "eventName", "ticketCount"],
    build: ({ metadata }) => ({
      inApp: {
        title: `Transferencia exitosa`,
        body: `Has transferido ${metadata.ticketCount} boleta(s) a ${metadata.receiverName} para ${metadata.eventName}`,
        metadata: {
          userId: metadata.userId,
          eventId: metadata.eventId,
          orderID: metadata.orderID,
          type: "ticket_transferred_sent",
        },
      },
      push: {
        title: `✅ Boletas transferidas`,
        body: `Transferiste ${metadata.ticketCount} boleta(s) a ${metadata.receiverName} para ${metadata.eventName}`,
        metadata: {
          userId: metadata.userId,
          eventId: metadata.eventId,
          orderID: metadata.orderID,
          type: "ticket_transferred_sent",
        },
      },
      email: {
        template: "email/ticket_transferred_sent.hbs",
        metadata: {
          title: `Transferencia completada - ${metadata.eventName}`,
          body: `Has transferido boletas a ${metadata.receiverName}`,
          viewTicketsLink: `https://doeventsapp.com/Mi%20Perfil/ProfileTickets?isOwnProfile=true`,
          ...metadata,
        },
      },
      whatsapp: {
        template: "whatsapp/ticket_transferred_sent.js",
        templateName: "tickets_transferred_sent",
        metadata: {
          title: `Transferencia exitosa`,
          body: `Transferiste ${metadata.ticketCount} boleta(s) a ${metadata.receiverName} para ${metadata.eventName}`,
          ...metadata,
        },
      },
    }),
  },

  ORDER_PAYMENT_APPROVED_BUYER: {
    triggerId: "ORDER_PAYMENT_APPROVED_BUYER",
    defaultChannels: ["email", "push", "inApp"],
    required: [
      "userId",
      "orderId",
      "orderReference",
      "eventName",
      "totalFormatted",
    ],
    build: ({ metadata }) => ({
      push: {
        title: `Compra aprobada`,
        body: `${metadata.eventName}: pago confirmado por ${metadata.totalFormatted}`,
        metadata: {
          userId: metadata.userId,
          orderId: metadata.orderId,
          orderReference: metadata.orderReference,
          eventId: metadata.eventId,
          eventName: metadata.eventName,
          totalFormatted: metadata.totalFormatted,
          type: "order_payment_approved_buyer",
          deepLink: metadata.purchasesLink || metadata.eventLink,
        },
      },
      inApp: {
        title: `Pago confirmado`,
        body: `Tu compra para ${metadata.eventName} fue aprobada correctamente.`,
        metadata: {
          userId: metadata.userId,
          orderId: metadata.orderId,
          orderReference: metadata.orderReference,
          eventId: metadata.eventId,
          eventName: metadata.eventName,
          totalFormatted: metadata.totalFormatted,
          type: "order_payment_approved_buyer",
          deepLink: metadata.purchasesLink || metadata.eventLink,
        },
      },
      email: {
        template: "email/order_payment_approved_buyer.hbs",
        metadata: {
          title: `Comprobante de pago - ${metadata.eventName}`,
          body: `Tu compra para ${metadata.eventName} fue aprobada correctamente.`,
          ...metadata,
        },
      },
    }),
  },

  ORDER_TICKET_RESERVED_BUYER: {
    triggerId: "ORDER_TICKET_RESERVED_BUYER",
    defaultChannels: ["email", "push", "inApp"],
    required: ["userId", "orderId", "eventName", "paymentLink"],
    build: ({ metadata }) => ({
      push: {
        title: "Reserva de boletas",
        body: `${metadata.eventName}: tienes 15 minutos para completar el pago${metadata.seatLabels ? ` (${metadata.seatLabels})` : ""}.`,
        metadata: {
          userId: metadata.userId,
          orderId: metadata.orderId,
          eventId: metadata.eventId,
          eventName: metadata.eventName,
          type: "order_ticket_reserved_buyer",
          deepLink: metadata.paymentLink || metadata.deepLink,
        },
      },
      inApp: {
        title: "Completa tu pago",
        body: `Reservaste boletas para ${metadata.eventName}. Tienes 15 minutos para pagar antes de perder la reserva.`,
        metadata: {
          userId: metadata.userId,
          orderId: metadata.orderId,
          eventId: metadata.eventId,
          eventName: metadata.eventName,
          seatLabels: metadata.seatLabels,
          type: "order_ticket_reserved_buyer",
          deepLink: metadata.paymentLink || metadata.deepLink,
        },
      },
      email: {
        template: "email/order_ticket_reserved_buyer.hbs",
        metadata: {
          title: `Reserva de boletas - ${metadata.eventName}`,
          body: `Tienes 15 minutos para completar el pago de tus boletas.`,
          ...metadata,
        },
      },
    }),
  },

  ORDER_NEW_SALE_OWNER: {
    triggerId: "ORDER_NEW_SALE_OWNER",
    defaultChannels: ["email", "push", "inApp"],
    required: [
      "userId",
      "orderId",
      "orderReference",
      "eventName",
      "totalFormatted",
      "buyerName",
    ],
    build: ({ metadata }) => ({
      push: {
        title: `Nueva venta confirmada`,
        body: `${metadata.buyerName} compró boletas para ${metadata.eventName}`,
        metadata: {
          userId: metadata.userId,
          ownerId: metadata.ownerId || metadata.userId,
          orderId: metadata.orderId,
          orderReference: metadata.orderReference,
          eventId: metadata.eventId,
          eventName: metadata.eventName,
          buyerName: metadata.buyerName,
          totalFormatted: metadata.totalFormatted,
          type: "order_new_sale_owner",
          deepLink: metadata.ownerStatsLink || metadata.salesLink || metadata.eventLink,
        },
      },
      inApp: {
        title: `Nueva venta`,
        body: `Se confirmó una nueva compra para ${metadata.eventName}.`,
        metadata: {
          userId: metadata.userId,
          ownerId: metadata.ownerId || metadata.userId,
          orderId: metadata.orderId,
          orderReference: metadata.orderReference,
          eventId: metadata.eventId,
          eventName: metadata.eventName,
          buyerName: metadata.buyerName,
          totalFormatted: metadata.totalFormatted,
          type: "order_new_sale_owner",
          deepLink: metadata.ownerStatsLink || metadata.salesLink || metadata.eventLink,
        },
      },
      email: {
        template: "email/order_new_sale_owner.hbs",
        metadata: {
          title: `Nueva venta - ${metadata.eventName}`,
          body: `Se confirmó una nueva compra para ${metadata.eventName}.`,
          ...metadata,
        },
      },
    }),
  },

  // ────────── Refund Notifications ──────────
  REFUND_REQUESTED: {
    triggerId: "REFUND_REQUESTED",
    required: [
      "userId",
      "eventName",
      "refundAmount",
      "ticketCount",
      "currency",
    ],
    defaultChannels: ["email", "push", "inApp", "whatsapp"],
    build: ({ metadata }) => ({
      push: {
        title: "Solicitud de reembolso recibida",
        body: `Tu solicitud de reembolso de ${metadata.refundAmount} ${metadata.currency} para ${metadata.eventName} está siendo procesada`,
        metadata: {
          userId: metadata.userId,
          type: "refund_requested",
          refundId: metadata.refundId,
          orderID: metadata.orderID,
          eventId: metadata.eventId,
        },
      },
      inApp: {
        title: "⏳ Solicitud de reembolso en proceso",
        body: `Reembolso ${metadata.refundType} de ${metadata.ticketCount} boleta(s) para ${metadata.eventName}`,
        metadata: {
          userId: metadata.userId,
          type: "refund_requested",
          refundId: metadata.refundId,
          orderID: metadata.orderID,
          eventId: metadata.eventId,
          refundAmount: metadata.refundAmount,
          currency: metadata.currency,
        },
      },
      email: {
        template: "email/refund_requested.hbs",
        subject: `Solicitud de reembolso - ${metadata.eventName}`,
        metadata: {
          userId: metadata.userId,
          preheader: "Tu solicitud está siendo procesada",
          eventName: metadata.eventName,
          refundAmount: metadata.refundAmount,
          currency: metadata.currency,
          ticketCount: metadata.ticketCount,
          refundType: metadata.refundType,
          orderID: metadata.orderID,
          refundDate: metadata.refundDate,
          processingDays: metadata.processingDays || "3-5",
          ticketDetails: metadata.ticketDetails || [],
          ...metadata,
        },
      },
      whatsapp: {
        template: "whatsapp/refund_requested.js",
        templateName: "refunds_requested",
        metadata: {
          userId: metadata.userId,
          title: "Solicitud de reembolso",
          body: `Solicitud de reembolso de ${metadata.refundAmount} ${metadata.currency} para ${metadata.eventName}`,
          ...metadata,
        },
      },
    }),
  },

  REFUND_REQUESTED_ORGANIZER: {
    triggerId: "REFUND_REQUESTED_ORGANIZER",
    required: ["userId", "eventName", "filingId", "refundAmount", "currency"],
    defaultChannels: ["email", "push", "inApp", "whatsapp"],
    build: ({ metadata }) => ({
      push: {
        title: "Nueva solicitud de reembolso",
        body: `${metadata.requesterName || "Un asistente"} solicitó reembolso (${metadata.filingId}) para ${metadata.eventName}`,
        metadata: {
          userId: metadata.userId,
          type: "refund_requested_organizer",
          filingId: metadata.filingId,
          eventId: metadata.eventId,
        },
      },
      inApp: {
        title: "Solicitud de reembolso recibida",
        body: `${metadata.requesterName || "Un asistente"} · Radicación ${metadata.filingId}: ${metadata.ticketCount} boleta(s) · ${metadata.refundAmount} ${metadata.currency}`,
        metadata: {
          userId: metadata.userId,
          type: "refund_requested_organizer",
          filingId: metadata.filingId,
          eventId: metadata.eventId,
          reason: metadata.reason,
          ticketDetails: metadata.ticketDetails || [],
          deepLink: metadata.eventId
            ? `/profile/stats?event=${metadata.eventId}&view=reembolsos`
            : "/profile/stats",
        },
      },
      email: {
        template: "email/refund_requested_organizer.hbs",
        subject: `Reembolso solicitado · ${metadata.filingId} · ${metadata.eventName}`,
        metadata: {
          userId: metadata.userId,
          preheader: `Radicación ${metadata.filingId}`,
          isOrganizerNotice: true,
          requesterName: metadata.requesterName,
          organizerName: metadata.organizerName || metadata.userName,
          ...metadata,
        },
      },
      whatsapp: {
        template: "whatsapp/refund_requested_organizer.js",
        // Meta aprobado existente (mismo shape de 6 vars). Copy en JS prioriza contexto organizador.
        templateName: "refunds_requested",
        metadata: {
          userId: metadata.userId,
          title: "Nueva solicitud de reembolso",
          body: `Radicación ${metadata.filingId}: ${metadata.requesterName || "Asistente"} solicita reembolso de ${metadata.ticketCount} boleta(s) para ${metadata.eventName}. Motivo: ${metadata.reason || "No indicado"}`,
          ...metadata,
        },
      },
    }),
  },

  REFUND_APPROVED: {
    triggerId: "REFUND_APPROVED",
    required: [
      "userId",
      "eventName",
      "refundAmount",
      "ticketCount",
      "currency",
    ],
    defaultChannels: ["email", "push", "inApp", "whatsapp"],
    build: ({ metadata }) => ({
      push: {
        title: "✅ Reembolso aprobado",
        body: `Tu reembolso de ${metadata.refundAmount} ${metadata.currency} ha sido aprobado`,
        metadata: {
          userId: metadata.userId,
          type: "refund_approved",
          refundId: metadata.refundId,
          orderId: metadata.orderId,
          eventId: metadata.eventId,
        },
      },
      inApp: {
        title: "✅ Reembolso aprobado",
        body: `Recibirás ${metadata.refundAmount} ${metadata.currency} en ${metadata.processingDays || "3-5"} días hábiles`,
        metadata: {
          userId: metadata.userId,
          type: "refund_approved",
          refundId: metadata.refundId,
          orderId: metadata.orderId,
          eventId: metadata.eventId,
          refundAmount: metadata.refundAmount,
          currency: metadata.currency,
        },
      },
      email: {
        template: "email/refund_approved.hbs",
        subject: `Reembolso aprobado - ${metadata.eventName}`,
        metadata: {
          userId: metadata.userId,
          preheader: `Tu reembolso de ${metadata.refundAmount} ${metadata.currency} ha sido aprobado`,
          eventName: metadata.eventName,
          refundAmount: metadata.refundAmount,
          currency: metadata.currency,
          ticketCount: metadata.ticketCount,
          refundType: metadata.refundType,
          orderId: metadata.orderId,
          approvalDate: metadata.approvalDate || new Date().toISOString(),
          processingDays: metadata.processingDays || "3-5",
          ticketDetails: metadata.ticketDetails || [],
          ...metadata,
        },
      },
      whatsapp: {
        template: "whatsapp/refund_approved.js",
        templateName: "refund_approved",
        metadata: {
          userId: metadata.userId,
          title: "Reembolso aprobado",
          body: `Tu reembolso de ${metadata.refundAmount} ${metadata.currency} ha sido aprobado`,
          ...metadata,
        },
      },
    }),
  },

  ITINERARY_TASK_ASSIGNED: {
    triggerId: "ITINERARY_TASK_ASSIGNED",
    defaultChannels: ["push", "inApp", "email"],
    required: ["userId", "eventId", "eventName", "taskId", "taskTitle"],
    build: ({ metadata }) => ({
      push: {
        title: `Nueva tarea asignada en ${metadata.eventName}`,
        body: `Se te ha asignado la tarea: ${metadata.taskTitle}`,
        metadata: {
          userId: metadata.userId,
          eventId: metadata.eventId,
          eventName: metadata.eventName,
          taskId: metadata.taskId,
          taskTitle: metadata.taskTitle,
        },
      },
      inApp: {
        title: `Tarea asignada: ${metadata.taskTitle}`,
        body: `Has sido asignado a una nueva tarea en el evento ${metadata.eventName}.`,
        metadata: {
          userId: metadata.userId,
          eventId: metadata.eventId,
          eventName: metadata.eventName,
          taskId: metadata.taskId,
          taskTitle: metadata.taskTitle,
        },
      },
      email: {
        template: "email/itinerary_task_assigned.hbs",
        metadata: {
          title: `Nueva tarea asignada en ${metadata.eventName}`,
          body: `Hola, se te ha asignado la tarea "${metadata.taskTitle}" en el evento ${metadata.eventName}.`,
          ...metadata,
        },
      },
    }),
  },

  PROMO_CODE_SHARED: {
    triggerId: "PROMO_CODE_SHARED",
    defaultChannels: ["inApp", "push", "email", "whatsapp"],
    required: ["userId", "eventName", "promoCode", "organizerName"],
    build: ({ metadata }) => ({
      inApp: {
        title: "Código promocional recibido",
        body: `${metadata.organizerName} te compartió el código ${metadata.promoCode} para ${metadata.eventName}`,
        metadata: {
          userId: metadata.userId,
          eventId: metadata.eventId,
          promoCode: metadata.promoCode,
          type: "promo_code_shared",
          route: metadata.eventId ? `event-detail:${metadata.eventId}` : undefined,
        },
      },
      push: {
        title: "Código promocional",
        body: `${metadata.organizerName} te envió un código para ${metadata.eventName}`,
        metadata: {
          userId: metadata.userId,
          eventId: metadata.eventId,
          promoCode: metadata.promoCode,
          type: "promo_code_shared",
        },
      },
      email: {
        template: "email/promo_code_shared.hbs",
        metadata: {
          title: `Código promocional - ${metadata.eventName}`,
          body: metadata.message || `${metadata.organizerName} te compartió un código promocional.`,
          email: metadata.email || metadata.to || metadata.recipientEmail || metadata.recipient_email || "",
          to: metadata.to || metadata.email || metadata.recipientEmail || metadata.recipient_email || "",
          recipientEmail: metadata.recipientEmail || metadata.recipient_email || metadata.email || metadata.to || "",
          ...metadata,
        },
      },
      whatsapp: {
        template: "whatsapp/promo_code_shared.js",
        templateName: "promo_code_shared",
        metadata: {
          title: "Código promocional",
          body: `${metadata.organizerName} te compartió el código ${metadata.promoCode}`,
          templateName: "promo_code_shared",
          userId: metadata.userId,
          ...metadata,
        },
      },
    }),
  },

  PROMO_CODE_CANCELED: {
    triggerId: "PROMO_CODE_CANCELED",
    defaultChannels: ["inApp", "push", "email"],
    required: ["userId", "eventName", "promoCode"],
    build: ({ metadata }) => ({
      inApp: {
        title: "Código promocional cancelado",
        body: metadata.message || `Tu código ${metadata.promoCode} para ${metadata.eventName} fue cancelado`,
        metadata: {
          userId: metadata.userId,
          eventId: metadata.eventId,
          promoCode: metadata.promoCode,
          type: "promo_code_canceled",
        },
      },
      push: {
        title: "Código cancelado",
        body: metadata.message || `El código ${metadata.promoCode} ya no está disponible`,
        metadata: {
          userId: metadata.userId,
          eventId: metadata.eventId,
          promoCode: metadata.promoCode,
          type: "promo_code_canceled",
        },
      },
      email: {
        template: "email/promo_code_canceled.hbs",
        metadata: {
          title: `Código cancelado - ${metadata.eventName}`,
          body: metadata.message,
          ...metadata,
        },
      },
      whatsapp: {
        template: "whatsapp/promo_code_canceled.js",
        templateName: "promo_code_canceled",
        metadata: {
          title: "Código cancelado",
          body: metadata.message,
          ...metadata,
        },
      },
    }),
  },
};

module.exports = { TEMPLATES };
