const fs = require("fs");
const path = require("path");
const Handlebars = require("handlebars");

const { TEMPLATES } = require("./src/templates");

const outputDir = path.join(__dirname, "tmp", "lifecycle-previews");
const templateBaseDir = path.join(__dirname, "src", "templates");

const baseMetadata = {
  userId: "preview-user-001",
  eventId: "18c39333-c094-4a87-8ede-8a0735022019",
  eventName: "Festival Sunset DoEvents",
  eventSlug: "festival-sunset-doevents",
  eventDate: "20260410",
  eventEndDate: "20260410",
  eventStartTime: "04:00 PM",
  eventEndTime: "08:00 PM",
  eventLocation: "Terraza Faro del Caribe",
  eventAddress: "Av. George Washington 500, Santo Domingo",
  eventCity: "Santo Domingo",
  venueName: "Terraza Faro del Caribe",
  organizerName: "DoEvents Live",
  userName: "Jeison",
  notificationTimestamp: new Date().toISOString(),
  eventImage:
    "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80",
};

const scenarios = [
  {
    fileName: "event-started-owner.html",
    templateKey: "EVENT_STARTED_OWNER",
    metadata: {
      ...baseMetadata,
      userId: "owner-preview-001",
      audience: "OWNER",
    },
  },
  {
    fileName: "event-started-buyer.html",
    templateKey: "EVENT_STARTED_BUYER",
    metadata: {
      ...baseMetadata,
      userId: "buyer-preview-001",
      audience: "BUYER",
    },
  },
  {
    fileName: "event-finished.html",
    templateKey: "EVENT_FINISHED",
    metadata: {
      ...baseMetadata,
      userId: "buyer-preview-001",
      audience: "ATTENDEE",
    },
  },
  {
    fileName: "event-rate-request.html",
    templateKey: "EVENT_RATE_REQUEST",
    metadata: {
      ...baseMetadata,
      userId: "buyer-preview-001",
      audience: "ATTENDEE",
    },
  },
];

function compileTemplate(templatePath, metadata) {
  const source = fs.readFileSync(templatePath, "utf8");
  const template = Handlebars.compile(source);
  return template({
    year: new Date().getFullYear(),
    ...metadata,
  });
}

function renderScenario(scenario) {
  const templateDefinition = TEMPLATES[scenario.templateKey];
  if (!templateDefinition) {
    throw new Error(`Template no encontrado: ${scenario.templateKey}`);
  }

  const content = templateDefinition.build({ metadata: scenario.metadata });
  const emailTemplate = content.email?.template;
  if (!emailTemplate) {
    throw new Error(`El template ${scenario.templateKey} no genera contenido email`);
  }

  const templatePath = path.join(templateBaseDir, emailTemplate);
  const html = compileTemplate(templatePath, content.email.metadata || {});
  const destinationPath = path.join(outputDir, scenario.fileName);

  fs.writeFileSync(destinationPath, html, "utf8");

  return {
    templateKey: scenario.templateKey,
    fileName: scenario.fileName,
    outputPath: destinationPath,
    push: content.push,
    inApp: content.inApp,
    email: {
      subject: content.email.metadata?.subject || content.email.title,
      title: content.email.metadata?.title || content.email.title,
      link: content.email.metadata?.link,
    },
  };
}

function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  const results = scenarios.map(renderScenario);
  const summaryPath = path.join(outputDir, "payload-summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2), "utf8");

  console.log(JSON.stringify({ outputDir, summaryPath, results }, null, 2));
}

main();