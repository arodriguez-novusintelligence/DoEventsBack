const fs = require("fs");
const path = require("path");
const Handlebars = require("handlebars");

const { TEMPLATES } = require("./src/templates");

const OUTPUT_DIR = path.join(__dirname, "tmp", "email-exercise-previews");
const TEMPLATE_BASE_DIR = path.join(__dirname, "src", "templates");
const DEFAULT_API =
  process.env.NOTIFICATIONS_API ||
  "https://ysfmaeawlf.execute-api.us-east-1.amazonaws.com/dev/trigger-notification";

const DEFAULT_METADATA = {
  userId: "42c2e4a4-0",
  ownerId: "42c2e4a4-0",
  userName: "Jeison",
  invitedBy: "Jeison Visbal",
  inviterName: "Jeison Visbal",
  promotedBy: "Jeison Visbal",
  demotedBy: "Jeison Visbal",
  eventId: "2fc3947e-036c-40a4-8f33-047af3738bc7",
  eventName: "Sunset Live Session",
  eventSlug: "sunset-live-session",
  eventDate: "20260512",
  eventStartDate: "20260512",
  eventEndDate: "20260512",
  eventStartTime: "07:00 PM",
  eventEndTime: "11:00 PM",
  eventLocation: "Terraza DoEvents",
  eventAddress: "Av. del Puerto 45",
  eventCity: "Cartagena",
  eventImage:
    "https://doeventimageeventbucket.s3.amazonaws.com/brand/fallback-invitation.jpg",
  link: "https://doeventsapp.com/Wall/DetalleEvento?eventId=2fc3947e-036c-40a4-8f33-047af3738bc7",
  message: "Te esperamos para una noche especial.",
  roomId: "room-preview-001",
  metric: "120 mensajes en 10 minutos",
  mentioner: "Laura",
  senderName: "Laura",
  orderId: "ord_82911",
  orderID: "ord_82911",
  orderReference: "DO-2026-00091",
  totalFormatted: "$290.000 COP",
  subtotalFormatted: "$263.636 COP",
  serviceFeeFormatted: "$26.364 COP",
  ticketCount: 2,
  buyerName: "Andres Ruiz",
  buyerUsername: "@andresruiz",
  buyerProfileImage: "",
  salesLink: "https://doeventsapp.com/Mi%20Perfil/ProfileTickets?isOwnProfile=true",
  eventLink:
    "https://doeventsapp.com/Wall/DetalleEvento?eventId=2fc3947e-036c-40a4-8f33-047af3738bc7",
  senderNameTransfer: "Jeison Visbal",
  receiverName: "Maria Perez",
  categoryItems: [
    {
      category: "General",
      quantity: 2,
      unitPriceFormatted: "$131.818",
      subtotalFormatted: "$263.636",
    },
  ],
  ticketDetails: [
    { category: "General", quantity: 2, amount: "$290.000 COP" },
  ],
  refundId: "ref_001",
  refundAmount: "145.000",
  currency: "COP",
  refundType: "Parcial",
  processingDays: "3-5",
  refundDate: "2026-04-29T10:00:00.000Z",
  approvalDate: "2026-04-29T10:00:00.000Z",
  supportEmail: "notificaciones.doevents@doeventsapp.com",
  year: new Date().getFullYear(),
};

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    send: args.includes("--send"),
    only: (args.find((arg) => arg.startsWith("--only=")) || "")
      .replace("--only=", "")
      .trim(),
    api:
      (args.find((arg) => arg.startsWith("--api=")) || "")
        .replace("--api=", "")
        .trim() || DEFAULT_API,
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function buildMetadata(templateKey) {
  const metadata = { ...DEFAULT_METADATA };

  if (templateKey === "CHAT_USER_INVITE_ACCEPTED") {
    metadata.body = `${metadata.userName} acepto la invitacion al chat.`;
  }

  if (templateKey === "CHAT_USER_INVITE_DECLINED") {
    metadata.body = `${metadata.invitedBy} te invito al chat del evento ${metadata.eventName}.`;
  }

  if (templateKey === "EVENT_RESCHEDULED") {
    metadata.originalStartDate = "20260512";
    metadata.newStartDate = "20260601";
    metadata.newEndDate = "20260601";
    metadata.reason = "Ajuste logistico de locacion.";
  }

  if (templateKey === "EVENT_CANCELLED") {
    metadata.reason = "Motivos operativos externos.";
  }

  if (templateKey === "TICKET_TRANSFERRED_RECEIVED") {
    metadata.senderName = "Carlos Mendez";
  }

  if (templateKey === "TICKET_TRANSFERRED_SENT") {
    metadata.receiverName = "Natalia Gomez";
  }

  if (templateKey === "ORDER_NEW_SALE_OWNER") {
    metadata.ownerId = metadata.userId;
    metadata.buyerProfileImage = "https://doeventimageeventbucket.s3.amazonaws.com/brand/fallback-invitation.jpg";
  }

  if (templateKey === "ORDER_PAYMENT_APPROVED_BUYER") {
    metadata.buyerProfileImage = "https://doeventimageeventbucket.s3.amazonaws.com/brand/fallback-invitation.jpg";
    metadata.organizerName = "Jeison Visbal";
    metadata.organizerUsername = "@jeisonvisbal";
  }

  if (templateKey === "EVENT_TICKET_SALES_SUMMARY_OWNER") {
    metadata.totalOrders = 18;
    metadata.soldTickets = 36;
    metadata.totalRevenue = 5220000;
    metadata.currency = "COP";
    metadata.totalOrdersFormatted = "18";
    metadata.soldTicketsFormatted = "36";
    metadata.totalRevenueFormatted = "COP 5.220.000";
    metadata.saleEndDate = "20260512";
    metadata.saleEndTime = "11:00 PM";
  }

  return metadata;
}

function getEmailTemplateEntries() {
  return Object.entries(TEMPLATES)
    .filter(([, definition]) =>
      Array.isArray(definition.defaultChannels)
        ? definition.defaultChannels.includes("email")
        : false,
    )
    .map(([templateKey, definition]) => ({ templateKey, definition }))
    .sort((a, b) => a.templateKey.localeCompare(b.templateKey));
}

function formatPreviewDate(value) {
  const normalized = String(value || "").trim();
  if (/^\d{8}$/.test(normalized)) {
    return `${normalized.substring(6, 8)}/${normalized.substring(4, 6)}/${normalized.substring(0, 4)}`;
  }
  return normalized;
}

function normalizePreviewDates(meta = {}) {
  const next = { ...meta };
  [
    "eventDate",
    "eventDateDisplay",
    "eventStartDate",
    "eventEndDate",
    "originalStartDate",
    "newStartDate",
    "newEndDate",
  ].forEach((key) => {
    if (next[key]) next[key] = formatPreviewDate(next[key]);
  });
  return next;
}

function renderHtml(templateFile, metadata) {
  const templatePath = path.join(TEMPLATE_BASE_DIR, templateFile);
  const source = fs.readFileSync(templatePath, "utf8");
  const compiled = Handlebars.compile(source);
  return compiled(normalizePreviewDates(metadata || {}));
}

async function triggerEmail(apiUrl, templateKey, metadata) {
  const payload = {
    templateKey,
    channels: ["email"],
    metadata,
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();

  return {
    status: response.status,
    ok: response.ok,
    body: bodyText,
  };
}

async function main() {
  const { send, only, api } = parseArgs();
  ensureDir(OUTPUT_DIR);

  const allEntries = getEmailTemplateEntries();
  const entries = only
    ? allEntries.filter((entry) => entry.templateKey === only)
    : allEntries;

  if (!entries.length) {
    console.error("No se encontraron templates para procesar");
    process.exit(1);
  }

  const summary = [];

  for (let i = 0; i < entries.length; i += 1) {
    const { templateKey, definition } = entries[i];
    const metadata = buildMetadata(templateKey);
    const content = definition.build({ metadata });
    const email = content.email;

    if (!email || !email.template) {
      summary.push({
        templateKey,
        processed: false,
        reason: "No email template in build result",
      });
      continue;
    }

    const finalMetadata = {
      year: new Date().getFullYear(),
      ...metadata,
      ...(email.metadata || {}),
    };

    const html = renderHtml(email.template, finalMetadata);
    const previewFile = `${String(i + 1).padStart(2, "0")}-${templateKey.toLowerCase()}.html`;
    const previewPath = path.join(OUTPUT_DIR, previewFile);
    fs.writeFileSync(previewPath, html, "utf8");

    const result = {
      templateKey,
      processed: true,
      emailTemplate: email.template,
      previewPath,
      sendResult: null,
    };

    if (send) {
      result.sendResult = await triggerEmail(api, templateKey, finalMetadata);
    }

    summary.push(result);
  }

  const summaryPath = path.join(OUTPUT_DIR, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        total: summary.length,
        sendMode: send,
        api,
        outputDir: OUTPUT_DIR,
        summaryPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("Error ejecutando ejercicio de templates email:", error);
  process.exit(1);
});
