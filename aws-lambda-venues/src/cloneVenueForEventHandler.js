const AWS = require("aws-sdk");

AWS.config.update({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const lambda = new AWS.Lambda();
const { v4: uuidv4 } = require("uuid");

const BUCKET_NAME = process.env.VENUE_IMAGES_BUCKET || "doevent-venue-images";
const EVENT_LIFECYCLE_SCHEDULER_UPSERT_FUNCTION =
  process.env.EVENT_LIFECYCLE_SCHEDULER_UPSERT_FUNCTION ||
  "events-lifecycle-manager-scheduler-upsert";
const DEFAULT_EVENT_TIMEZONE = "America/Bogota";

const tableName = (envKey, fallback) => process.env[envKey] || fallback;

const resolveElementImageSource = (elementData = {}) =>
  elementData.image ||
  elementData.imageUrl ||
  elementData.url ||
  elementData.uri ||
  elementData.src ||
  elementData.signedUrl ||
  "";

const parseS3KeyFromVenueImageUrl = (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== "string") return null;

  try {
    const parsed = new URL(imageUrl);
    const host = parsed.host.toLowerCase();
    const bucket = BUCKET_NAME.toLowerCase();
    const path = parsed.pathname || "";

    // virtual-hosted-style: <bucket>.s3.amazonaws.com/<key>
    if (host === `${bucket}.s3.amazonaws.com`) {
      return path.replace(/^\//, "") || null;
    }

    // regional virtual-hosted-style: <bucket>.s3.<region>.amazonaws.com/<key>
    if (host.startsWith(`${bucket}.s3.`) && host.endsWith(".amazonaws.com")) {
      return path.replace(/^\//, "") || null;
    }

    // path-style: s3.amazonaws.com/<bucket>/<key> or s3.<region>.amazonaws.com/<bucket>/<key>
    if (
      (host === "s3.amazonaws.com" ||
        (host.startsWith("s3.") && host.endsWith(".amazonaws.com"))) &&
      path.startsWith(`/${BUCKET_NAME}/`)
    ) {
      return path.replace(`/${BUCKET_NAME}/`, "");
    }

    return null;
  } catch (error) {
    return null;
  }
};

const cloneElementImageToNewVenue = async ({
  sourceImageUrl,
  newVenueId,
  newElementId,
}) => {
  if (!sourceImageUrl) return "";

  const sourceKey = parseS3KeyFromVenueImageUrl(sourceImageUrl);
  if (!sourceKey) {
    // Si no es del bucket de venues, conservar URL original.
    return sourceImageUrl;
  }

  try {
    const sourceFileName = sourceKey.split("/").pop() || `${newElementId}.jpg`;
    const destinationKey = `venues/${newVenueId}/elements/${newElementId}/${sourceFileName}`;
    const encodedSourceKey = sourceKey
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    await s3
      .copyObject({
        Bucket: BUCKET_NAME,
        CopySource: `${BUCKET_NAME}/${encodedSourceKey}`,
        Key: destinationKey,
        MetadataDirective: "COPY",
      })
      .promise();

    return `https://${BUCKET_NAME}.s3.amazonaws.com/${destinationKey}`;
  } catch (error) {
    console.warn(
      `[cloneVenueForEvent] No se pudo clonar imagen del elemento (${sourceImageUrl}): ${error.message}`,
    );
    // Fallback para no bloquear la clonación completa.
    return sourceImageUrl;
  }
};

const normalizeSaleDate = (dateValue, fallbackValue) => {
  if (dateValue === undefined || dateValue === null || String(dateValue).trim() === "") {
    return fallbackValue;
  }

  const normalized = String(dateValue).trim();
  if (/^\d{8}$/.test(normalized)) {
    return normalized;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
    const [day, month, year] = normalized.split("/");
    return `${year}${month}${day}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split("-");
    return `${year}${month}${day}`;
  }

  return fallbackValue;
};

const normalizeSaleTime = (timeValue, fallbackValue) => {
  if (timeValue === undefined || timeValue === null) {
    return fallbackValue;
  }

  const normalized = String(timeValue).trim();
  return normalized || fallbackValue;
};

const buildSaleWindowFromIso = (isoValue, timezone = DEFAULT_EVENT_TIMEZONE) => {
  if (!isoValue) {
    return null;
  }

  const parsedDate = new Date(isoValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || DEFAULT_EVENT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(parsedDate).reduce((accumulator, part) => {
    if (part.type !== "literal") {
      accumulator[part.type] = part.value;
    }
    return accumulator;
  }, {});

  if (!parts.year || !parts.month || !parts.day || !parts.hour || !parts.minute) {
    return null;
  }

  return {
    date: `${parts.year}${parts.month}${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
};

const resolveSaleBoundary = ({
  rawDateValue,
  rawTimeValue,
  isoValue,
  timezone,
  fallbackDate,
  fallbackTime,
}) => {
  const derivedWindow = buildSaleWindowFromIso(isoValue, timezone);

  return {
    date: normalizeSaleDate(rawDateValue, derivedWindow?.date || fallbackDate),
    time: normalizeSaleTime(rawTimeValue, derivedWindow?.time || fallbackTime),
  };
};

const resolveTicketSaleWindow = ({
  body = {},
  eventData = null,
  fallbackStartDate,
  fallbackEndDate,
  fallbackStartTime = "00:00",
  fallbackEndTime = "23:59",
}) => {
  const timezone = body.timezone || eventData?.timezone || DEFAULT_EVENT_TIMEZONE;

  const saleStart = resolveSaleBoundary({
    rawDateValue: body.fechaIniVent,
    rawTimeValue: body.horaIniVent,
    isoValue: body.salesStartAt || eventData?.salesStartAt,
    timezone,
    fallbackDate: fallbackStartDate,
    fallbackTime: fallbackStartTime,
  });

  const saleEnd = resolveSaleBoundary({
    rawDateValue: body.fechaFinVent,
    rawTimeValue: body.horaFinVent,
    isoValue: body.salesEndAt || eventData?.salesEndAt,
    timezone,
    fallbackDate: fallbackEndDate,
    fallbackTime: fallbackEndTime,
  });

  return {
    fechaIniVent: saleStart.date,
    fechaFinVent: saleEnd.date,
    horaIniVent: saleStart.time,
    horaFinVent: saleEnd.time,
  };
};

const getEventSaleWindowSource = async (eventId) => {
  if (!eventId) {
    return null;
  }

  try {
    const result = await dynamodb
      .get({
        TableName: tableName('EVENTS_TABLE', 'Eventos'),
        Key: { id: eventId },
        ProjectionExpression:
          "id, salesStartAt, salesEndAt, fechaIni, fechaFin, horaIni, horaFin, #timezone",
        ExpressionAttributeNames: {
          "#timezone": "timezone",
        },
      })
      .promise();

    return result.Item || null;
  } catch (error) {
    console.warn(
      `[cloneVenueForEvent] No se pudo obtener el sale window del evento ${eventId}: ${error.message}`,
    );
    return null;
  }
};

const notifyLifecycleScheduler = async (eventId) => {
  if (!eventId) return;

  try {
    await lambda
      .invoke({
        FunctionName: EVENT_LIFECYCLE_SCHEDULER_UPSERT_FUNCTION,
        InvocationType: "Event",
        Payload: JSON.stringify({ eventId }),
      })
      .promise();
  } catch (error) {
    console.warn(
      `[cloneVenueForEvent] No se pudo reconciliar lifecycle scheduler para eventId=${eventId}: ${error.message}`,
    );
  }
};

/**
 * Genera las boletas individuales en TicketsDistribution
 * Crea un ticket instance por cada boleta disponible en cada categoría
 * NOTA: TicketsDistribution usa clave compuesta (id, createDate)
 * @param {object} seatsMapping - Mapping de categoryId a array de seatIds clonados
 */
async function generateTicketsDistribution(
  eventId,
  venueId,
  ticketId,
  categories,
  now,
  seatsMapping = {},
) {
  console.log(
    `🎫 Generando TicketsDistribution para ${categories.length} categorías...`,
  );
  console.log(
    `📍 EventId: ${eventId}, VenueId: ${venueId}, TicketId: ${ticketId}`,
  );

  const distributionItems = [];

  for (const category of categories) {
    const distributionId = category.distributionId || uuidv4();
    const createDate = category.distributionCreateDate || now;
    const cantidadTickets = category.cantidadTickets || 0;

    console.log(
      `📝 Procesando categoría: ${category.categoria}, tickets: ${cantidadTickets}, id: ${category.id}, gateId: ${category.gateId}, color: ${category.color}`,
    );

    if (cantidadTickets <= 0) {
      console.log(
        `⚠️ Categoría ${category.categoria} no tiene tickets, omitiendo...`,
      );
      continue;
    }

    // Obtener los seatIds clonados para esta categoría
    const categorySeats = seatsMapping[category.id] || [];
    console.log(
      `🪑 Categoría ${category.categoria} tiene ${categorySeats.length} sillas en seatsMapping`,
    );

    // Generar array de tickets individuales
    const ticketsArray = [];
    for (let i = 0; i < cantidadTickets; i++) {
      const seat = categorySeats[i]; // Puede ser undefined si no hay asientos (hasSeating: false)

      ticketsArray.push({
        ticketInstanceId: uuidv4(),
        category: category.categoria || category.id,
        categoryId: category.id,
        categoryColor: category.color || category.categoryColor || null,
        location: seat
          ? {
              seatId: seat.seatId,
              rowLabel: seat.rowLabel,
              colNumber: seat.colNumber,
              seatLabel:
                seat.seatLabel ||
                `${seat.rowLabel || ""}${seat.colNumber || ""}`,
              floorId: seat.floorId || null,
              venueId: venueId,
            }
          : {},
        ticketStatus: "AVAILABLE",
        qrCodeKey: uuidv4(),
        ownerId: null,
        entityType: "TICKET",
        purchasePrice: category.valor || 0,
        orderId: null,
        distributionId: distributionId,
        createDate: createDate,
      });
    }

    const distributionItem = {
      id: distributionId, // PK
      createDate: createDate, // SK (clave compuesta)
      ticketId: ticketId,
      eventId: eventId,
      venueId: venueId,
      boletaId: category.id,
      categoryName: category.categoria,
      categoryColor: category.color || category.categoryColor || null,
      gateId: category.gateId || null,
      tickets: ticketsArray,
    };

    console.log(
      `📦 Item a guardar:`,
      JSON.stringify({
        id: distributionItem.id,
        eventId: distributionItem.eventId,
        categoryName: distributionItem.categoryName,
        ticketsCount: distributionItem.tickets.length,
      }),
    );

    distributionItems.push({
      PutRequest: {
        Item: distributionItem,
      },
    });

    console.log(
      `✅ ${cantidadTickets} tickets creados para categoría ${category.categoria} (${seatsMapping[category.id] ? "con asientos asignados" : "sin asientos"})`,
    );
  }

  // Guardar en TicketsDistribution por lotes (máximo 25 por batch)
  if (distributionItems.length > 0) {
    const chunkSize = 25;

    try {
      for (let i = 0; i < distributionItems.length; i += chunkSize) {
        const chunk = distributionItems.slice(i, i + chunkSize);
        console.log(
          `📤 Guardando batch ${Math.floor(i / chunkSize) + 1} de ${chunk.length} distribuciones...`,
        );

        const batchResult = await dynamodb
          .batchWrite({
            RequestItems: {
              [tableName('TICKETS_DIST_TABLE', 'TicketsDistribution')]: chunk,
            },
          })
          .promise();

        // Verificar si hay items sin procesar
        if (
          batchResult.UnprocessedItems &&
          Object.keys(batchResult.UnprocessedItems).length > 0
        ) {
          console.error(
            `❌ Items sin procesar en batch ${Math.floor(i / chunkSize) + 1}:`,
            JSON.stringify(batchResult.UnprocessedItems),
          );
          throw new Error(
            `Algunos items no se procesaron en TicketsDistribution`,
          );
        }

        console.log(
          `✅ Batch ${Math.floor(i / chunkSize) + 1} guardado exitosamente`,
        );
      }

      console.log(
        `✅ ${distributionItems.length} distribuciones creadas exitosamente en TicketsDistribution`,
      );
    } catch (error) {
      console.error("❌ Error guardando distribuciones:", error);
      console.error("Stack:", error.stack);
      throw new Error(`Error al crear TicketsDistribution: ${error.message}`);
    }
  } else {
    console.log("⚠️ No se crearon distribuciones (sin categorías con tickets)");
  }

  return distributionItems.length;
}

// Exportar la función para que otros handlers (ej. updateVenueHandler) la puedan reutilizar
module.exports.generateTicketsDistribution = generateTicketsDistribution;
module.exports.getEventSaleWindowSource = getEventSaleWindowSource;
module.exports.resolveTicketSaleWindow = resolveTicketSaleWindow;

/**
 * Clona un venue base y lo convierte en un venue específico para un evento
 *
 * Body esperado:
 * {
 *   "baseVenueId": "uuid-del-venue-base",
 *   "eventId": "uuid-del-evento",
 *   "name": "Nombre personalizado (opcional)",
 *   "hasSeating": true/false (opcional, por defecto mantiene el del venue base),
 *   "categories": [...] (opcional, para agregar info de tickets),
 *   "fechaIniVent": "fecha inicio venta",
 *   "fechaFinVent": "fecha fin venta",
 *   "horaIniVent": "hora inicio",
 *   "horaFinVent": "hora fin",
 *   "overrides": {
 *     // Cualquier campo del venue que quieras sobrescribir
 *     "capacity": 5000,
 *     "status": "active",
 *     etc.
 *   }
 * }
 */
exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const body = JSON.parse(event.body);
    const userId =
      event.requestContext?.authorizer?.claims?.sub ||
      body.userId ||
      body.createdBy ||
      body.updatedBy ||
      body.ownerUserId;

    // Validaciones
    if (!body.baseVenueId || !body.eventId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "baseVenueId and eventId are required",
        }),
      };
    }

    const { baseVenueId, eventId, overrides = {} } = body;

    // 1. Obtener el venue base
    const baseVenueResult = await dynamodb
      .get({
        TableName: tableName('VENUE_TABLE', 'Venues'),
        Key: { venue_id: baseVenueId },
      })
      .promise();

    if (!baseVenueResult.Item) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Base venue not found",
        }),
      };
    }

    const baseVenue = baseVenueResult.Item;

    // 2. Crear el nuevo venue de evento
    const newVenueId = uuidv4();
    const now = new Date().toISOString();

    // 2.1. Procesar imágenes en base64 si existen
    const uploadedImageUrls = [];

    console.log("[IMAGE-DEBUG] Iniciando procesamiento de imagenes...");
    console.log(
      "[IMAGE-DEBUG] body.imageBase64:",
      body.imageBase64 ? "Presente" : "No presente",
    );
    console.log(
      "[IMAGE-DEBUG] body.images:",
      body.images ? `Array con ${body.images.length} elementos` : "No presente",
    );

    // Soportar tanto array de imágenes como imagen única
    const imagesToProcess = [];

    // Si viene un array de imágenes
    if (body.images && Array.isArray(body.images)) {
      console.log(
        `[IMAGE-DEBUG] Agregando ${body.images.length} imagenes del array`,
      );
      imagesToProcess.push(...body.images);
    }

    // Si viene una imagen única (imageBase64)
    if (body.imageBase64) {
      console.log("[IMAGE-DEBUG] Agregando imageBase64 al procesamiento");
      const base64Data = body.imageBase64.includes(",")
        ? body.imageBase64.split(",")[1]
        : body.imageBase64;

      // Detectar tipo de imagen desde data URI o usar default
      let fileExtension = "jpg";
      if (body.imageBase64.includes("data:image/")) {
        const match = body.imageBase64.match(/data:image\/([a-zA-Z]+);base64,/);
        if (match) {
          fileExtension = match[1];
        }
      }

      imagesToProcess.push({
        base64: base64Data,
        fileName: `venue-image.${fileExtension}`,
      });
    }

    console.log(
      `[IMAGE-DEBUG] Total de imagenes a procesar: ${imagesToProcess.length}`,
    );

    if (imagesToProcess.length > 0) {
      console.log(
        `[IMAGE-DEBUG] Processing ${imagesToProcess.length} images...`,
      );

      for (const imageData of imagesToProcess) {
        if (imageData.base64 && imageData.fileName) {
          try {
            // Generar ID único para la imagen
            const imageId = uuidv4();
            const fileExtension = imageData.fileName
              .split(".")
              .pop()
              .toLowerCase();
            const s3Key = `venues/${newVenueId}/${imageId}.${fileExtension}`;

            // Decodificar base64
            const imageBuffer = Buffer.from(imageData.base64, "base64");

            // Determinar Content-Type
            const contentTypeMap = {
              jpg: "image/jpeg",
              jpeg: "image/jpeg",
              png: "image/png",
              gif: "image/gif",
              webp: "image/webp",
              svg: "image/svg+xml",
              bmp: "image/bmp",
              tiff: "image/tiff",
              ico: "image/x-icon",
            };
            const contentType = contentTypeMap[fileExtension] || "image/jpeg";

            // Subir a S3 (sin ACL porque el bucket no lo permite)
            await s3
              .upload({
                Bucket: BUCKET_NAME,
                Key: s3Key,
                Body: imageBuffer,
                ContentType: contentType,
                Metadata: {
                  venueId: newVenueId,
                  uploadedAt: now,
                  originalFileName: imageData.fileName,
                },
              })
              .promise();

            // Construir URL pública
            const imageUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${s3Key}`;
            uploadedImageUrls.push(imageUrl);

            console.log(
              `[IMAGE-SUCCESS] Image uploaded successfully: ${imageUrl}`,
            );
          } catch (imageError) {
            console.error("[IMAGE-ERROR] Error uploading image:", imageError);
            console.error(
              "Error details:",
              JSON.stringify(imageError, null, 2),
            );
            // Continuar con las demás imágenes
          }
        } else {
          console.log(
            "[IMAGE-WARNING] Imagen sin base64 o fileName, omitiendo...",
          );
        }
      }
    }

    console.log(
      `[IMAGE-DEBUG] Total de imagenes subidas: ${uploadedImageUrls.length}`,
    );
    console.log("[IMAGE-DEBUG] URLs generadas:", uploadedImageUrls);

    // 2.2. Clonar gates del venue base en la tabla Venue_Gate independiente
    const baseGates = baseVenue.gates || [];
    const clonedGates = [];
    const gateIdMapping = {}; // Para mapear IDs antiguos a nuevos

    if (baseGates.length > 0) {
      console.log(`🚪 Clonando ${baseGates.length} gates para el evento...`);

      const gatePromises = baseGates.map(async (gate) => {
        const newGateId = uuidv4(); // Nuevo ID para el gate clonado
        gateIdMapping[gate.gateId] = newGateId; // Guardar mapeo

        const clonedGate = {
          gateId: newGateId,
          gateNumber: gate.gateNumber,
          name: gate.name,
          description: gate.description || "",
        };

        // Guardar en Venue_Gate
        await dynamodb
          .put({
            TableName: tableName('VENUE_GATE_TABLE', 'Venue_Gate'),
            Item: {
              ...clonedGate,
              venueId: newVenueId,
              eventId: eventId,
              assignedStaff: [], // Array vacío para nueva asignación
              status: "active",
              createdAt: now,
              createdBy: userId,
              updatedAt: now,
              updatedBy: userId,
            },
          })
          .promise();

        return clonedGate;
      });

      const results = await Promise.all(gatePromises);
      clonedGates.push(...results);
      console.log(
        `✓ ${clonedGates.length} gates clonados y guardados en Venue_Gate`,
      );
    }

    const eventVenue = {
      ...baseVenue, // Copiar todos los campos del venue base
      ...overrides, // Aplicar sobrescrituras
      venue_id: newVenueId, // Nueva ID
      venueId: newVenueId,
      name: body.name || `${baseVenue.name} - Event`,
      eventId: eventId, // Atar al evento
      isEventVenue: true,
      hasSeating:
        body.hasSeating !== undefined ? body.hasSeating : baseVenue.hasSeating,
      baseVenueId: baseVenueId, // Referencia al venue original
      gates: clonedGates, // Usar gates clonados con nuevos IDs
      images:
        uploadedImageUrls.length > 0
          ? uploadedImageUrls.join(",")
          : baseVenue.images || "", // Usar imágenes nuevas o copiar del base
      isOwnerOrAdmin:
        body.isOwnerOrAdmin !== undefined
          ? body.isOwnerOrAdmin
          : baseVenue.isOwnerOrAdmin || false,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
      usageCount: 0, // Resetear contador
    };

    console.log("📝 Venue a guardar - images field:", eventVenue.images);
    console.log("📝 Base venue images:", baseVenue.images);

    // Guardar el nuevo venue
    await dynamodb
      .put({
        TableName: tableName('VENUE_TABLE', 'Venues'),
        Item: eventVenue,
      })
      .promise();

    // 3. Clonar floors
    const floorsResult = await dynamodb
      .query({
        TableName: tableName('VENUE_FLOOR_TABLE', 'Venue_Floor'),
        IndexName: "venueIdIndex",
        KeyConditionExpression: "venueId = :venueId",
        ExpressionAttributeValues: {
          ":venueId": baseVenueId,
        },
      })
      .promise();

    const clonedFloors = [];
    const floorIdMapping = {}; // Map viejo ID -> nuevo ID

    for (const baseFloor of floorsResult.Items || []) {
      const newFloorId = uuidv4();
      floorIdMapping[baseFloor.floorId] = newFloorId;

      const defaultEditorSettings = {
        showActionLabels: false,
        canvasGridVisible: true,
        canvasDarkMode: false,
        canvasGridVisualMode: "normal",
        workspaceExpansion: { left: 0, top: 0, right: 1800, bottom: 1200 },
      };
      const newFloor = {
        ...baseFloor,
        floorId: newFloorId,
        venueId: newVenueId,
        editorSettings: baseFloor.editorSettings || defaultEditorSettings,
        createdAt: now,
        createdBy: userId,
      };

      await dynamodb
        .put({
          TableName: tableName('VENUE_FLOOR_TABLE', 'Venue_Floor'),
          Item: newFloor,
        })
        .promise();

      clonedFloors.push(newFloorId);
    }

    // 4. Clonar elementos
    for (const oldFloorId of Object.keys(floorIdMapping)) {
      const elementsResult = await dynamodb
        .query({
          TableName: tableName('VENUE_ELEMENT_TABLE', 'Venue_Element'),
          IndexName: "floorIdIndex",
          KeyConditionExpression: "floorId = :floorId",
          ExpressionAttributeValues: {
            ":floorId": oldFloorId,
          },
        })
        .promise();

      for (const baseElement of elementsResult.Items || []) {
        const newElementId = uuidv4();
        const newFloorId = floorIdMapping[oldFloorId];
        const sourceImageUrl = resolveElementImageSource(baseElement);
        const clonedImageUrl = await cloneElementImageToNewVenue({
          sourceImageUrl,
          newVenueId,
          newElementId,
        });

        const newElement = {
          ...baseElement,
          elementId: newElementId,
          floorId: newFloorId,
          venueId: newVenueId,
          image: clonedImageUrl || "",
          createdAt: now,
          createdBy: userId,
        };

        await dynamodb
          .put({
            TableName: tableName('VENUE_ELEMENT_TABLE', 'Venue_Element'),
            Item: newElement,
          })
          .promise();
      }
    }

    // 5. Clonar categorías (solo si hasSeating es true)
    const categoryIdMapping = {};
    const allTicketCategories = [];

    for (const oldFloorId of Object.keys(floorIdMapping)) {
      const categoriesResult = await dynamodb
        .query({
          TableName: tableName('VENUE_CATEGORY_TABLE', 'Venue_Category'),
          IndexName: "floorIdIndex",
          KeyConditionExpression: "floorId = :floorId",
          ExpressionAttributeValues: {
            ":floorId": oldFloorId,
          },
        })
        .promise();

      for (const baseCategory of categoriesResult.Items || []) {
        const newCategoryId = uuidv4();
        categoryIdMapping[baseCategory.categoryId] = newCategoryId;
        const newFloorId = floorIdMapping[oldFloorId];

        const quantityFromCategory =
          baseCategory.cantidadTickets ??
          baseCategory.ticketQuantity ??
          baseCategory.totalSeats ??
          baseCategory.quantity ??
          0;

        // Mapear gateId del antiguo al nuevo usando gateIdMapping
        const oldGateId = baseCategory.gateId;
        const newGateId = oldGateId ? gateIdMapping[oldGateId] || null : null;

        const newCategory = {
          ...baseCategory,
          categoryId: newCategoryId,
          floorId: newFloorId,
          venueId: newVenueId,
          eventId: eventId,
          gateId: newGateId, // Mapear al nuevo gateId
          colOrder: baseCategory.colOrder || null,
          rowOrder: baseCategory.rowOrder || null,
          costo:
            typeof baseCategory.costo === "boolean"
              ? baseCategory.costo
              : baseCategory.costo !== undefined
                ? baseCategory.costo
                : baseCategory.cost !== undefined
                  ? baseCategory.cost
                  : false,
          valor:
            baseCategory.valor !== undefined
              ? baseCategory.valor
              : baseCategory.ticketPrice !== undefined
                ? baseCategory.ticketPrice
                : 0,
          moneda: baseCategory.moneda || baseCategory.currency || "COP",
          currency: baseCategory.currency || baseCategory.moneda || "COP",
          ticketPrice:
            baseCategory.ticketPrice !== undefined
              ? baseCategory.ticketPrice
              : baseCategory.valor !== undefined
                ? baseCategory.valor
                : 0,
          hasPrice:
            baseCategory.hasPrice !== undefined
              ? baseCategory.hasPrice
              : typeof baseCategory.costo === "boolean"
                ? baseCategory.costo
                : false,
          cantidadTickets: quantityFromCategory,
          ticketQuantity: quantityFromCategory,
          availableCapacity: quantityFromCategory,
          createDate: now,
          createdBy: userId,
        };

        // Siempre guardar en Venue_Category (independiente de hasSeating)
        // Si no hay seating, floorId será null pero la categoría debe existir
        await dynamodb
          .put({
            TableName: tableName('VENUE_CATEGORY_TABLE', 'Venue_Category'),
            Item: newCategory,
          })
          .promise();

        // Preparar categoría de ticket para la tabla Tickets
        // El gateId ya está mapeado en las variables oldGateId y newGateId de arriba

        allTicketCategories.push({
          categoria: baseCategory.name,
          id: newCategoryId,
          color: baseCategory.color,
          cantidadTickets: eventVenue.hasSeating ? 0 : quantityFromCategory, // Se actualizará con los asientos si aplica
          avaliableCapacity: eventVenue.hasSeating ? 0 : quantityFromCategory,
          reservedTickets: 0,
          soldTickets: 0,
          moneda: "COP",
          costo:
            typeof baseCategory.costo === "boolean"
              ? baseCategory.costo
              : baseCategory.costo || false,
          valor:
            baseCategory.valor !== undefined
              ? baseCategory.valor
              : baseCategory.ticketPrice || 0,
          descripcion: "",
          imgboleta: "",
          distributionId: uuidv4(),
          distributionCreateDate: now,
          gateId: newGateId, // ID del gate mapeado
        });
      }
    }

    // 6. Clonar asientos (solo si hasSeating es true)
    const seatsMapping = {}; // Mapping de categoryId a array de seatIds clonados

    if (eventVenue.hasSeating) {
      console.log(
        `🪑 INICIANDO CLONACIÓN DE SILLAS (hasSeating: ${eventVenue.hasSeating})`,
      );
      console.log(
        `📊 Categorías a procesar: ${Object.keys(categoryIdMapping).length}`,
      );

      for (const oldCategoryId of Object.keys(categoryIdMapping)) {
        const seatsResult = await dynamodb
          .query({
            TableName: tableName('VENUE_SEAT_TABLE', 'Venue_Seat'),
            IndexName: "categoryIdIndex",
            KeyConditionExpression: "categoryId = :categoryId",
            ExpressionAttributeValues: {
              ":categoryId": oldCategoryId,
            },
          })
          .promise();
        const seats = seatsResult.Items || [];

        console.log(
          `🔍 Categoría ${oldCategoryId}: encontradas ${seats.length} sillas`,
        );

        // Actualizar contador de asientos en la categoría de ticket
        const newCategoryId = categoryIdMapping[oldCategoryId];
        const ticketCategory = allTicketCategories.find(
          (tc) => tc.id === newCategoryId,
        );
        if (ticketCategory) {
          ticketCategory.cantidadTickets = seats.length;
          ticketCategory.avaliableCapacity = seats.length;
          console.log(
            `✅ Actualizada categoría ${ticketCategory.categoria}: ${seats.length} tickets`,
          );

          // Sincronizar cantidad en Venue_Category
          const categoryQtyUpdateExpression = userId
            ? "SET cantidadTickets = :qty, ticketQuantity = :qty, availableCapacity = :qty, updatedAt = :updatedAt, updatedBy = :updatedBy"
            : "SET cantidadTickets = :qty, ticketQuantity = :qty, availableCapacity = :qty, updatedAt = :updatedAt";
          const categoryQtyExpressionAttributeValues = {
            ":qty": seats.length,
            ":updatedAt": now,
          };
          if (userId) {
            categoryQtyExpressionAttributeValues[":updatedBy"] = userId;
          }

          await dynamodb
            .update({
              TableName: tableName('VENUE_CATEGORY_TABLE', 'Venue_Category'),
              Key: { categoryId: newCategoryId },
              UpdateExpression: categoryQtyUpdateExpression,
              ExpressionAttributeValues: categoryQtyExpressionAttributeValues,
            })
            .promise();
        }

        // Inicializar array para esta categoría
        seatsMapping[newCategoryId] = [];
        console.log(`📝 Inicializado seatsMapping[${newCategoryId}]`);

        // Clonar asientos en batches de 25
        const batchSize = 25;
        for (let i = 0; i < seats.length; i += batchSize) {
          const batch = seats.slice(i, i + batchSize);

          const putRequests = batch.map((baseSeat) => {
            const newSeatId = uuidv4();
            const oldFloorId = baseSeat.floorId;
            const newFloorId = floorIdMapping[oldFloorId];

            const newSeat = {
              ...baseSeat,
              seatId: newSeatId,
              categoryId: newCategoryId,
              floorId: newFloorId,
              venueId: newVenueId,
              status: "available", // Resetear status
              createdAt: now,
              createdBy: userId,
            };

            // Guardar en el mapping para usar en TicketsDistribution
            const rowLabel = baseSeat.rowLabel || baseSeat.row || "";
            const colNumber = baseSeat.colNumber || baseSeat.number || 0;
            seatsMapping[newCategoryId].push({
              seatId: newSeatId,
              rowLabel,
              colNumber,
              floorId: newFloorId,
              seatLabel:
                baseSeat.seatLabel ||
                baseSeat.seatCode ||
                `${rowLabel}${colNumber}`,
            });

            return {
              PutRequest: {
                Item: newSeat,
              },
            };
          });

          await dynamodb
            .batchWrite({
              RequestItems: {
                Venue_Seat: putRequests,
              },
            })
            .promise();
        }

        console.log(
          `✅ Categoría ${newCategoryId}: ${seatsMapping[newCategoryId].length} sillas agregadas a seatsMapping`,
        );
      }

      console.log(
        `🎯 RESUMEN seatsMapping:`,
        Object.keys(seatsMapping).map((catId) => ({
          categoryId: catId,
          seatsCount: seatsMapping[catId].length,
        })),
      );
    }

    // 7. Merge con categories del body si existen
    if (body.categories && Array.isArray(body.categories)) {
      console.log(
        `📝 Mergeando ${body.categories.length} categorías del body...`,
      );
      for (const ticketCat of body.categories) {
        const resolvedCategoryId =
          (ticketCat.id && categoryIdMapping[ticketCat.id]) ||
          ticketCat.categoryId ||
          ticketCat.id;
        // Buscar si ya existe una categoría con ese id
        const existingIndex = allTicketCategories.findIndex(
          (tc) => tc.id === (resolvedCategoryId || ticketCat.id),
        );

        if (existingIndex >= 0) {
          // Actualizar categoría existente
          // Prioridad: 1) Cantidad calculada de seats (si hay), 2) Cantidad del body, 3) Mantener existente
          const seatCount = eventVenue.hasSeating
            ? allTicketCategories[existingIndex].cantidadTickets
            : 0;
          const finalCantidad =
            seatCount > 0
              ? seatCount
              : ticketCat.cantidadTickets ||
                allTicketCategories[existingIndex].cantidadTickets ||
                0;

          allTicketCategories[existingIndex] = {
            ...allTicketCategories[existingIndex],
            ...ticketCat,
            cantidadTickets: finalCantidad,
            avaliableCapacity: finalCantidad,
            distributionId:
              ticketCat.distributionId ||
              allTicketCategories[existingIndex].distributionId,
          };
          console.log(
            `✏️ Actualizada categoría existente: ${ticketCat.categoria} con ${allTicketCategories[existingIndex].cantidadTickets} tickets`,
          );

          // Actualizar también la categoría en Venue_Category con costo/valor/moneda
          if (resolvedCategoryId) {
            const categoryUpdateExpressions = [
              "#costo = :costo",
              "#valor = :valor",
              "#moneda = :moneda",
              "#currency = :currency",
              "#ticketPrice = :ticketPrice",
              "#hasPrice = :hasPrice",
              "#updatedAt = :updatedAt",
            ];
            const categoryExpressionAttributeNames = {
              "#costo": "costo",
              "#valor": "valor",
              "#moneda": "moneda",
              "#currency": "currency",
              "#ticketPrice": "ticketPrice",
              "#hasPrice": "hasPrice",
              "#updatedAt": "updatedAt",
            };

            const categoryPriceExpressionAttributeValues = {
              ":costo":
                typeof ticketCat.costo === "boolean"
                  ? ticketCat.costo
                  : ticketCat.costo !== undefined
                    ? ticketCat.costo
                    : ticketCat.cost !== undefined
                      ? ticketCat.cost
                      : false,
              ":valor":
                ticketCat.valor !== undefined
                  ? ticketCat.valor
                  : ticketCat.ticketPrice !== undefined
                    ? ticketCat.ticketPrice
                    : ticketCat.price !== undefined
                      ? ticketCat.price
                      : 0,
              ":moneda": ticketCat.moneda || ticketCat.currency || "COP",
              ":currency": ticketCat.currency || ticketCat.moneda || "COP",
              ":ticketPrice":
                ticketCat.ticketPrice !== undefined
                  ? ticketCat.ticketPrice
                  : ticketCat.valor !== undefined
                    ? ticketCat.valor
                    : ticketCat.price || 0,
              ":hasPrice":
                ticketCat.hasPrice !== undefined
                  ? ticketCat.hasPrice
                  : typeof ticketCat.costo === "boolean"
                    ? ticketCat.costo
                    : false,
              ":updatedAt": now,
            };

            const optionalCategoryFields = [
              "floorId",
              "gateId",
              "color",
              "geometry",
              "zIndex",
              "rotation",
              "relX",
              "relY",
              "width",
              "height",
              "rowOrder",
              "colOrder",
            ];

            optionalCategoryFields.forEach((field) => {
              if (ticketCat[field] !== undefined) {
                categoryUpdateExpressions.push(`#${field} = :${field}`);
                categoryExpressionAttributeNames[`#${field}`] = field;
                categoryPriceExpressionAttributeValues[`:${field}`] =
                  ticketCat[field];
              }
            });

            if (ticketCat.name !== undefined || ticketCat.categoria !== undefined) {
              categoryUpdateExpressions.push("#name = :name");
              categoryExpressionAttributeNames["#name"] = "name";
              categoryPriceExpressionAttributeValues[":name"] =
                ticketCat.name || ticketCat.categoria;
            }

            if (
              ticketCat.description !== undefined ||
              ticketCat.descripcion !== undefined
            ) {
              categoryUpdateExpressions.push("#description = :description");
              categoryExpressionAttributeNames["#description"] =
                "description";
              categoryPriceExpressionAttributeValues[":description"] =
                ticketCat.description || ticketCat.descripcion || "";
            }

            if (userId) {
              categoryUpdateExpressions.push("#updatedBy = :updatedBy");
              categoryExpressionAttributeNames["#updatedBy"] = "updatedBy";
              categoryPriceExpressionAttributeValues[":updatedBy"] = userId;
            }

            await dynamodb
              .update({
                TableName: tableName('VENUE_CATEGORY_TABLE', 'Venue_Category'),
                Key: { categoryId: resolvedCategoryId },
                UpdateExpression: `SET ${categoryUpdateExpressions.join(", ")}`,
                ExpressionAttributeNames: categoryExpressionAttributeNames,
                ExpressionAttributeValues: categoryPriceExpressionAttributeValues,
              })
              .promise();
          }
        } else {
          // Agregar nueva categoría (para venues sin asientos)
          const newCategory = {
            categoria: ticketCat.categoria,
            id: ticketCat.id || uuidv4(),
            cantidadTickets: ticketCat.cantidadTickets || 0,
            avaliableCapacity: ticketCat.cantidadTickets || 0,
            reservedTickets: 0,
            soldTickets: 0,
            moneda: ticketCat.moneda || "COP",
          color: ticketCat.color,
            costo:
              typeof ticketCat.costo === "boolean"
                ? ticketCat.costo
                : ticketCat.costo || false,
            valor: ticketCat.valor || 0,
            descripcion: ticketCat.descripcion || "",
            imgboleta: ticketCat.imgboleta || "",
            distributionId: ticketCat.distributionId || uuidv4(),
            distributionCreateDate: now,
          };
          allTicketCategories.push(newCategory);
          console.log(
            `➕ Agregada nueva categoría: ${newCategory.categoria} con ${newCategory.cantidadTickets} tickets`,
          );

          // Crear/actualizar Venue_Category para la nueva categoría sin asientos
          const newVenueCategoryId = newCategory.id;
          const newCatQty = Number.isFinite(Number(newCategory.cantidadTickets))
            ? Number(newCategory.cantidadTickets)
            : 0;
          await dynamodb
            .put({
              TableName: tableName('VENUE_CATEGORY_TABLE', 'Venue_Category'),
              Item: {
                categoryId: newVenueCategoryId,
                ...(ticketCat.floorId && { floorId: ticketCat.floorId }),
                venueId: newVenueId,
                eventId: eventId,
                name: ticketCat.name || newCategory.categoria,
                color: ticketCat.color || "#000000",
                gateId: newCategory.gateId || null,
                geometry: ticketCat.geometry || "RECTANGLE",
                zIndex:
                  ticketCat.zIndex !== undefined ? ticketCat.zIndex : 0,
                rotation:
                  ticketCat.rotation !== undefined ? ticketCat.rotation : 0,
                relX: ticketCat.relX || 0,
                relY: ticketCat.relY || 0,
                width: ticketCat.width || 0,
                height: ticketCat.height || 0,
                rowOrder: ticketCat.rowOrder || null,
                colOrder: ticketCat.colOrder || null,
                description: ticketCat.description || ticketCat.descripcion || "",
                costo: newCategory.costo || 0,
                valor: newCategory.valor || 0,
                moneda: newCategory.moneda || "COP",
                currency: newCategory.moneda || "COP",
                ticketPrice: newCategory.valor || 0,
                hasPrice: newCategory.hasPrice || false,
                cantidadTickets: newCatQty,
                ticketQuantity: newCatQty,
                availableCapacity: newCatQty,
                createDate: now,
                createdBy: userId,
              },
            })
            .promise();
        }
      }
    }

    console.log(
      `📊 Total de categorías procesadas: ${allTicketCategories.length}`,
    );

    // 8. Guardar en tabla Tickets
    let ticketRecord = null;
    if (allTicketCategories.length > 0) {
      const ticketId = uuidv4().substring(0, 10);
      const eventSaleWindow = await getEventSaleWindowSource(eventId);
      const saleWindow = resolveTicketSaleWindow({
        body,
        eventData: eventSaleWindow,
        fallbackStartDate: eventSaleWindow?.fechaIni || eventVenue.fechaIni || now,
        fallbackEndDate: eventSaleWindow?.fechaFin || eventVenue.fechaFin || now,
      });

      ticketRecord = {
        id: ticketId,
        eventId: eventId,
        venueId: newVenueId,
        boletas: allTicketCategories,
        fechaIniVent: saleWindow.fechaIniVent,
        fechaFinVent: saleWindow.fechaFinVent,
        horaIniVent: saleWindow.horaIniVent,
        horaFinVent: saleWindow.horaFinVent,
        createDate: now,
        hasSeating: eventVenue.hasSeating,
      };

      await dynamodb
        .put({
          TableName: tableName('TICKETS_TABLE', 'Tickets'),
          Item: ticketRecord,
        })
        .promise();

      console.log(
        `✅ Registro de Tickets creado con ${allTicketCategories.length} categorías`,
      );

      // 🎫 GENERAR TICKETS DISTRIBUTION
      // Crear las boletas individuales en TicketsDistribution con asociación a sillas
      console.log(
        `🚀 Iniciando generateTicketsDistribution con eventId: ${eventId}, venueId: ${newVenueId}, ticketId: ${ticketId}`,
      );

      try {
        const distributionsCreated = await generateTicketsDistribution(
          eventId,
          newVenueId,
          ticketId,
          allTicketCategories,
          now,
          seatsMapping,
        );

        console.log(
          `✅ ${distributionsCreated} distribuciones creadas en TicketsDistribution`,
        );
      } catch (distError) {
        console.error(
          "❌ ERROR CRÍTICO en generateTicketsDistribution:",
          distError,
        );
        console.error("Stack completo:", distError.stack);
        console.error("EventId:", eventId);
        console.error("VenueId:", newVenueId);
        console.error("TicketId:", ticketId);
        console.error(
          "Categorías:",
          JSON.stringify(
            allTicketCategories.map((c) => ({
              id: c.id,
              categoria: c.categoria,
              cantidadTickets: c.cantidadTickets,
            })),
          ),
        );

        // No lanzar el error para que el venue se cree, pero registrarlo
        console.error("⚠️ El venue se creó pero las distribuciones fallaron");
      }
    }

    // 9. Clonar gates (puertas) - se copian como parte del venue en el objeto eventVenue
    // Los gates ya están incluidos en eventVenue.gates desde baseVenue

    // Incrementar contador de uso del venue base
    await dynamodb
      .update({
        TableName: tableName('VENUE_TABLE', 'Venues'),
        Key: { venue_id: baseVenueId },
        UpdateExpression:
          "SET usageCount = usageCount + :inc, updatedAt = :now",
        ExpressionAttributeValues: {
          ":inc": 1,
          ":now": now,
        },
      })
      .promise();

    // Actualizar el evento en la tabla Eventos con el venueId
    try {
      await dynamodb
        .update({
          TableName: tableName('EVENTS_TABLE', 'Eventos'),
          Key: { id: eventId },
          UpdateExpression: "SET venueId = :venueId, updatedAt = :updatedAt",
          ExpressionAttributeValues: {
            ":venueId": newVenueId,
            ":updatedAt": now,
          },
          ConditionExpression: "attribute_exists(id)", // Verificar que el evento existe
        })
        .promise();
      console.log(`✅ Evento ${eventId} actualizado con venueId ${newVenueId}`);
    } catch (updateError) {
      console.error(`⚠️ Error actualizando evento ${eventId}:`, updateError);
      // No fallar la clonación si la actualización del evento falla
    }

    await notifyLifecycleScheduler(eventId);

    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Venue cloned successfully for event",
        venue: {
          venueId: newVenueId,
          name: eventVenue.name,
          eventId: eventId,
          baseVenueId: baseVenueId,
          isEventVenue: true,
          hasSeating: eventVenue.hasSeating,
          floorsCloned: clonedFloors.length,
          categoriesCloned: Object.keys(categoryIdMapping).length,
          gatesCloned: eventVenue.gates ? eventVenue.gates.length : 0,
          ticketRecord: ticketRecord
            ? {
                ticketId: ticketRecord.id,
                categoriesCount: ticketRecord.boletas.length,
                totalCapacity: ticketRecord.boletas.reduce(
                  (sum, b) => sum + b.cantidadTickets,
                  0,
                ),
              }
            : null,
        },
      }),
    };
  } catch (error) {
    console.error("Error in cloneVenueForEventHandler:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};
