/**
 * Ejemplos actualizados de uso de dispatchNotification
 * Ahora la firma es: dispatchNotification({ templateKey, metadata, channels })
 */

const { dispatchNotification } = require("./src/utils/dispatchNotification");

const log = (title, payload) => {
  console.log(`\n📝 ${title}`);
  console.log(JSON.stringify(payload, null, 2));
};

// 1) Chat iniciado (multi-canal por defecto)
async function ex1_ChatStarted() {
  const req = {
    templateKey: "CHAT_USER_START",
    metadata: {
      userId: "42c2e4a4-0",
      eventName: "Conferencia Tech 2025",
      userName: "Juan Pérez",
      link: "https://doevents.app/chat/room-123",
    },
  };
  log("Ejemplo 1: CHAT_USER_START", req);
  return dispatchNotification(req);
}

// 2) Invitación enviada (incluye WhatsApp con templateName)
async function ex2_InviteSend() {
  const params = {
    templateKey: "CHAT_USER_INVITE_SEND",
    channels: ["email", "push", "inApp", "whatsapp"],
    metadata: {
      status: "invitation-pending",
      userId: "42c2e4a4-0",
      userName: "Luis Carlos",
      type: "chat-room-invitation",
      eventName: "Meetup DoEvents",
      invitedBy: "El administrador",
      link: "doeventsapp://chat/chat-room-event-5k3fln1uw",
      roomId: "chat-room-event-5k3fln1uw",
    },
  };
  log("Ejemplo 2: CHAT_USER_INVITE_SEND", params);
  return dispatchNotification(params);
}

// 3) Nuevo mensaje (push + inApp por defecto)
async function ex3_NewMessage() {
  const req = {
    templateKey: "CHAT_USER_NEW_MESSAGE",
    metadata: {
      userId: "user-789",
      eventName: "Evento NodeJS",
      senderName: "Carlos",
      message: "Hola, equipo!",
      messageId: "msg-001",
    },
  };
  log("Ejemplo 3: CHAT_USER_NEW_MESSAGE", req);
  return dispatchNotification(req);
}

// 4) Anuncio (forzando solo push e email)
async function ex4_AnnouncementPushEmail() {
  const req = {
    templateKey: "CHAT_USER_ANNOUNCEMENT",
    metadata: {
      userId: "42c2e4a4-5",
      eventName: "Hackathon DoEvents",
      message: "El taller inicia en 15 minutos",
    },
    channels: ["push", "email", "inApp"],
  };
  log("Ejemplo 4: CHAT_USER_ANNOUNCEMENT (push+email)", req);
  return dispatchNotification(req);
}

// 5) Cierre próximo (email + push por defecto)
async function ex5_ClosingNotice() {
  const req = {
    templateKey: "CHAT_USER_CLOSING_NOTICE",
    metadata: {
      userId: "user-654",
      eventName: "Bootcamp JS",
      message: "El chat cerrará en 30 minutos",
    },
  };
  log("Ejemplo 5: CHAT_USER_CLOSING_NOTICE", req);
  return dispatchNotification(req);
}

// 6) Admin alerta de actividad (email + push)
async function ex6_AdminActivityAlert() {
  const req = {
    templateKey: "ADMIN_ACTIVITY_ALERT",
    metadata: {
      userId: "admin-001",
      eventName: "Summit DoEvents",
      metric: "+200 mensajes / 5 min",
    },
  };
  log("Ejemplo 6: ADMIN_ACTIVITY_ALERT", req);
  return dispatchNotification(req);
}

// 7) Template inválido (error controlado)
async function ex7_InvalidTemplate() {
  const req = { templateKey: "INVALID_TRIGGER", metadata: { userId: "u-x" } };
  log("Ejemplo 7: INVALID_TRIGGER", req);
  return dispatchNotification(req);
}

// Ejecutar todos
async function runAllExamples() {
  const list = [
    // ex1_ChatStarted,
    ex2_InviteSend,
    // ex3_NewMessage,
    // ex4_AnnouncementPushEmail,
    // ex5_ClosingNotice,
    // ex6_AdminActivityAlert,
    // ex7_InvalidTemplate,
  ];
  for (const fn of list) {
    try {
      const res = await fn();
      console.log("✅ Resultado:", JSON.stringify(res, null, 2));
    } catch (e) {
      console.error("❌ Error:", e && e.message);
    }
  }
}

if (require.main === module) {
  runAllExamples().catch(console.error);
}

module.exports = {
  ex1_ChatStarted,
  ex2_InviteSend,
  ex3_NewMessage,
  ex4_AnnouncementPushEmail,
  ex5_ClosingNotice,
  ex6_AdminActivityAlert,
  ex7_InvalidTemplate,
  runAllExamples,
};
