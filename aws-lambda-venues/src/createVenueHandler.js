const AWS = require("aws-sdk");

AWS.config.update({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-2",
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const lambda = new AWS.Lambda();
const { v4: uuidv4 } = require("uuid");
// Reusar generador de distribuciones
const {
  generateTicketsDistribution,
  getEventSaleWindowSource,
  resolveTicketSaleWindow,
} = require("./cloneVenueForEventHandler");
const { resolveCategorySeats } = require("./seatGridUtils");
const { normalizeIncomingImageUrls } = require("./imagePersistence");

const BUCKET_NAME = process.env.VENUE_IMAGES_BUCKET || "doevent-venue-images";
const EVENT_LIFECYCLE_SCHEDULER_UPSERT_FUNCTION =
  process.env.EVENT_LIFECYCLE_SCHEDULER_UPSERT_FUNCTION ||
  "events-lifecycle-manager-scheduler-upsert";

const tableName = (envKey, fallback) => process.env[envKey] || fallback;

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
      `[createVenue] No se pudo reconciliar lifecycle scheduler para eventId=${eventId}: ${error.message}`,
    );
  }
};

const resolveElementImageSource = (elementData = {}) =>
  elementData.image ||
  elementData.imageUrl ||
  elementData.url ||
  elementData.uri ||
  elementData.src ||
  elementData.signedUrl ||
  "";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT,DELETE",
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    console.log("Event:", JSON.stringify(event));
    const body = JSON.parse(event.body);
    const userId =
      event.requestContext?.authorizer?.claims?.sub ||
      body.createdBy ||
      body.updatedBy ||
      body.ownerUserId;

    if (!body.name || !body.ownerUserId) {
      return respond(400, { error: "name and ownerUserId are required" });
    }

    const venueId = uuidv4();
    const now = new Date().toISOString();

    // Determinar si es un venue de evento o venue base
    const eventId = body.eventId || null;
    const isEventVenue = eventId !== null;
    const hasSeating = body.hasSeating !== undefined ? body.hasSeating : true;
    const eventSaleWindow = isEventVenue
      ? await getEventSaleWindowSource(eventId).catch((err) => {
          console.warn(
            `[createVenue] sale window omitido para eventId=${eventId}: ${err.message}`,
          );
          return null;
        })
      : null;

    // Procesar imágenes en base64 si existen
    const uploadedImageUrls = [];
    const directImageUrls = normalizeIncomingImageUrls(body.images);

    // Soportar tanto array de imágenes como imagen única
    const imagesToProcess = [];

    // Si viene un array de imágenes
    if (body.images && Array.isArray(body.images)) {
      imagesToProcess.push(...body.images);
    }

    // Si viene una imagen única (imageBase64)
    if (body.imageBase64) {
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

    if (imagesToProcess.length > 0) {
      console.log(`Processing ${imagesToProcess.length} images...`);

      for (const imageData of imagesToProcess) {
        if (imageData.base64 && imageData.fileName) {
          try {
            // Generar ID único para la imagen
            const imageId = uuidv4();
            const fileExtension = imageData.fileName
              .split(".")
              .pop()
              .toLowerCase();
            const s3Key = `venues/${venueId}/${imageId}.${fileExtension}`;

            // Decodificar base64 (soporta data URI o base64 puro)
            const normalizedBase64 = imageData.base64.includes(",")
              ? imageData.base64.split(",")[1]
              : imageData.base64;
            const imageBuffer = Buffer.from(normalizedBase64, "base64");

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
                  venueId: venueId,
                  uploadedAt: now,
                  originalFileName: imageData.fileName,
                },
              })
              .promise();

            // Construir URL pública
            const imageUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${s3Key}`;
            uploadedImageUrls.push(imageUrl);

            console.log(`Image uploaded: ${imageUrl}`);
          } catch (imageError) {
            console.error("Error uploading image:", imageError);
            // Continuar con las demás imágenes
          }
        }
      }
    }

    // Procesar gates (puertas) si existen - ANTES de crear el venue
    const gates = [];
    if (body.gates && Array.isArray(body.gates)) {
      console.log(`Procesando ${body.gates.length} gates...`);
      console.log("Gates recibidos:", JSON.stringify(body.gates));
      for (const gateData of body.gates) {
        const gateId = gateData.gateId || uuidv4();

        gates.push({
          gateId,
          gateNumber: gateData.gateNumber,
          name: gateData.name,
          description: gateData.description || "",
        });
      }
      console.log("Gates procesados:", JSON.stringify(gates));

      // Guardar gates en tabla Venue_Gate independiente
      if (gates.length > 0) {
        const gatePromises = gates.map((gate) => {
          return dynamodb
            .put({
              TableName: tableName('VENUE_GATE_TABLE', 'Venue_Gate'),
              Item: {
                gateId: gate.gateId,
                venueId: venueId,
                eventId: eventId, // null para base venues, eventId para event venues
                gateNumber: gate.gateNumber,
                name: gate.name,
                description: gate.description || "",
                assignedStaff: [], // Array vacío para futura asignación de personal
                status: "active",
                createdAt: now,
                createdBy: userId,
                updatedAt: now,
                updatedBy: userId,
              },
            })
            .promise();
        });

        await Promise.all(gatePromises);
        console.log(`✓ ${gates.length} gates guardados en Venue_Gate`);
      }
    }

    // Preparar el venue (DynamoDB usa venue_id como clave)
    const venue = {
      venue_id: venueId, // Clave primaria en DynamoDB
      venueId, // También mantener para compatibilidad
      ownerUserId: body.ownerUserId,
      coAdminIds: Array.isArray(body.coAdminIds) ? body.coAdminIds : [],
      name: body.name,
      type: body.type || "stadium",
      capacity: body.capacity || 0,
      country: body.country || "",
      city: body.city || undefined,
      address: body.address || "",
      address2: body.address2 || "",
      postalCode: body.postalCode || "",
      timezone: body.timezone || "UTC",
      geo: body.geo || "",
      amenities: body.amenities || "",
      images: [...new Set([...directImageUrls, ...uploadedImageUrls])].join(","), // URLs directas y/o imágenes subidas
      latitude: body.latitude || null,
      longitude: body.longitude || null,
      tags: body.tags || "",
      gates: gates, // Agregar gates al venue
      isTemplate: body.isTemplate || false,
      isCertified: body.isCertified || false,
      isOwnerOrAdmin:
        body.isOwnerOrAdmin !== undefined ? body.isOwnerOrAdmin : false,
      visibility: body.visibility || "private",
      status: body.status || "draft",
      usageCount: 0,
      likeCount: 0,
      rating: 0,
      reviewCount: 0,
      floorplanVersion: body.floorplanVersion || 1,
      // Nuevos campos para soportar venues de evento
      eventId: eventId, // null para venues base, eventId para venues de evento
      isEventVenue: isEventVenue, // true si está atado a un evento
      hasSeating: hasSeating, // true si tiene silletería, false si es general
      baseVenueId: body.baseVenueId || null, // Referencia al venue base si fue clonado
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
    };

    console.log("Venue a guardar - gates:", JSON.stringify(venue.gates));
    console.log("Venue a guardar - completo:", JSON.stringify(venue));

    // Guardar venue en DynamoDB
    await dynamodb
      .put({
        TableName: tableName('VENUE_TABLE', 'Venues'),
        Item: venue,
      })
      .promise();

    // Si es un venue de evento, actualizar el evento en la tabla Eventos con el venueId
    if (isEventVenue && eventId) {
      try {
        await dynamodb
          .update({
            TableName: tableName('EVENTS_TABLE', 'Eventos'),
            Key: { id: eventId },
            UpdateExpression: "SET venueId = :venueId, updatedAt = :updatedAt",
            ExpressionAttributeValues: {
              ":venueId": venueId,
              ":updatedAt": now,
            },
            ConditionExpression: "attribute_exists(id)", // Verificar que el evento existe
          })
          .promise();
        console.log(`✅ Evento ${eventId} actualizado con venueId ${venueId}`);
      } catch (updateError) {
        console.error(`⚠️ Error actualizando evento ${eventId}:`, updateError);
        // No fallar la creación del venue si la actualización del evento falla
        // El venue se creó correctamente, solo logueamos el error
      }
    }

    // Procesar pisos (floors) solo si hasSeating es true o si se proveen floors
    const floors = [];
    const floorArray = body.floors || body.floor || [];

    // Si hasSeating es false, floors es opcional
    const shouldProcessFloors =
      hasSeating || (Array.isArray(floorArray) && floorArray.length > 0);

    if (
      shouldProcessFloors &&
      Array.isArray(floorArray) &&
      floorArray.length > 0
    ) {
      console.log(`Procesando ${floorArray.length} pisos...`);
      for (const floorData of floorArray) {
        // Usar floorId del frontend o generar uno nuevo
        const floorId = floorData.floorId || uuidv4();

        // Crear floor
        const defaultEditorSettings = {
          showActionLabels: false,
          canvasGridVisible: true,
          canvasDarkMode: false,
          canvasGridVisualMode: "normal",
          workspaceExpansion: { left: 0, top: 0, right: 1800, bottom: 1200 },
        };
        const floor = {
          floorId,
          venueId,
          name: floorData.name,
          description: floorData.description || "",
          image: floorData.image || "",
          canvasZoom: floorData.canvasZoom !== undefined ? floorData.canvasZoom : 1,
          editorSettings: floorData.editorSettings || defaultEditorSettings,
          createdAt: now,
          createdBy: userId,
        };

        await dynamodb
          .put({
            TableName: tableName('VENUE_FLOOR_TABLE', 'Venue_Floor'),
            Item: floor,
          })
          .promise();

        // Procesar elementos del piso si existen
        const elements = [];
        if (floorData.elements && Array.isArray(floorData.elements)) {
          for (const elementData of floorData.elements) {
            // Usar elementId del frontend o generar uno nuevo
            const elementId = elementData.elementId || uuidv4();
            const image = resolveElementImageSource(elementData);

            if (
              (elementData.geometry === "IMAGEN" || elementData.type === "IMAGEN") &&
              !image
            ) {
              console.warn(
                `⚠️ Elemento IMAGEN sin fuente de imagen (elementId=${elementId})`,
              );
            }

            const element = {
              elementId,
              floorId,
              venueId,
              name: elementData.name,
              type: elementData.type || elementData.geometry || "other",
              geometry: elementData.geometry || elementData.type || "RECTANGLE",
              position: elementData.position || "",
              relX: elementData.relX || 0,
              relY: elementData.relY || 0,
              zIndex: elementData.zIndex !== undefined ? elementData.zIndex : 0,
              rotation:
                elementData.rotation !== undefined ? elementData.rotation : 0,
              image,
              width: elementData.width || 0,
              height: elementData.height || 0,
              horseshoeCurvature: elementData.horseshoeCurvature !== undefined ? elementData.horseshoeCurvature : 0,
              ringThickness:
                elementData.ringThickness !== undefined
                  ? elementData.ringThickness
                  : elementData.horseshoeCurvature !== undefined
                    ? elementData.horseshoeCurvature
                    : 55,
              textColor: elementData.textColor || "",
              textFontWeight: elementData.textFontWeight || "",
              textFontFamily: elementData.textFontFamily || "",
              textFontSize: elementData.textFontSize !== undefined ? elementData.textFontSize : 0,
              notes: elementData.notes || "",
              createdAt: now,
              createdBy: userId,
            };

            await dynamodb
              .put({
                TableName: tableName('VENUE_ELEMENT_TABLE', 'Venue_Element'),
                Item: element,
              })
              .promise();

            elements.push(elementId);
          }
        }

        // Procesar categorías del piso
        const categories = [];
        if (floorData.categories && Array.isArray(floorData.categories)) {
          for (const categoryData of floorData.categories) {
            // Usar categoryId del frontend o generar uno nuevo
            const categoryId = categoryData.categoryId || uuidv4();

            const category = {
              categoryId,
              floorId,
              venueId,
              ...(eventId && { eventId }), // Solo agregar eventId si no es null
              name: categoryData.name,
              color: categoryData.color || "#000000",
              level: categoryData.level || 0,
              sortOrder: categoryData.sortOrder || 0,
              gateId: categoryData.gateId || null,
              gateName: categoryData.gateName || "",
              relX: categoryData.relX || 0,
              relY: categoryData.relY || 0,
              width: categoryData.width || 0,
              height: categoryData.height || 0,
              geometry: categoryData.geometry || "RECTANGLE",
              zIndex:
                categoryData.zIndex !== undefined ? categoryData.zIndex : 0,
              rotation:
                categoryData.rotation !== undefined ? categoryData.rotation : 0,
              config: categoryData.config || "",
              isAccessibleZone: categoryData.isAccessibleZone || false,
              hasPrice:
                categoryData.hasPrice !== undefined
                  ? categoryData.hasPrice
                  : typeof categoryData.costo === "boolean"
                    ? categoryData.costo
                    : false,
              costo:
                typeof categoryData.costo === "boolean"
                  ? categoryData.costo
                  : categoryData.costo !== undefined
                    ? categoryData.costo
                    : categoryData.ticketCategory?.costo || false,
              valor:
                categoryData.valor !== undefined
                  ? categoryData.valor
                  : categoryData.ticketCategory?.valor || 0,
              moneda:
                categoryData.moneda ||
                categoryData.currency ||
                categoryData.ticketCategory?.moneda ||
                "COP",
              currency:
                categoryData.currency ||
                categoryData.moneda ||
                categoryData.ticketCategory?.moneda ||
                "COP",
              ticketPrice:
                categoryData.ticketPrice !== undefined
                  ? categoryData.ticketPrice
                  : categoryData.valor !== undefined
                    ? categoryData.valor
                    : categoryData.ticketCategory?.valor || 0,
              colOrder: categoryData.colOrder || null,
              rowOrder: categoryData.rowOrder || null,
              rows: categoryData.rows || 0,
              seatsPerRow: categoryData.seatsPerRow || 0,
              description:
                categoryData.description ||
                categoryData.ticketCategory?.descripcion ||
                "",
              ringThickness:
                categoryData.ringThickness !== undefined
                  ? categoryData.ringThickness
                  : 55,
              createDate: now,
              createdBy: userId,
            };

            // Siempre guardar categorías de floors en Venue_Category (tanto para templates como venues de evento)
            await dynamodb
              .put({
                TableName: tableName('VENUE_CATEGORY_TABLE', 'Venue_Category'),
                Item: category,
              })
              .promise();

            // Si hay ticketCategory data (categorías de boletas tipo managetickets)
            // siempre se guardan independientemente de hasSeating
            if (categoryData.ticketCategory) {
              const ticketCategoryData = {
                categoria:
                  categoryData.ticketCategory.categoria || categoryData.name,
                id: categoryData.ticketCategory.id || categoryId,
                cantidadTickets:
                  categoryData.ticketCategory.cantidadTickets || 0,
                avaliableCapacity:
                  categoryData.ticketCategory.cantidadTickets || 0,
                reservedTickets: 0,
                soldTickets: 0,
                moneda: categoryData.ticketCategory.moneda || "COP",
                costo: categoryData.ticketCategory.costo || 0,
                valor: categoryData.ticketCategory.valor || 0,
                descripcion: categoryData.ticketCategory.descripcion || "",
                imgboleta: categoryData.ticketCategory.imgboleta || "",
                color:
                  categoryData.ticketCategory.color ||
                  categoryData.color ||
                  null,
                distributionId:
                  categoryData.ticketCategory.distributionId || uuidv4(),
                distributionCreateDate: now,
                eventId: eventId,
                venueId: venueId,
                categoryId: categoryId,
              };

              categories.push(ticketCategoryData);
            }

            // Procesar asientos directamente en la categoría (siempre, no solo si hasSeating)
            // Si estamos procesando floors con categorías, las sillas deben crearse
            const seats = [];
            const resolvedSeats = resolveCategorySeats(categoryData, categoryId);
            if (Array.isArray(resolvedSeats) && resolvedSeats.length > 0) {
              // Batch write para asientos (máximo 25 por batch)
              const batchSize = 25;
              for (let i = 0; i < resolvedSeats.length; i += batchSize) {
                const batch = resolvedSeats.slice(i, i + batchSize);

                const putRequests = batch.map((seatData) => {
                  // Usar seatId del frontend o generar uno nuevo
                  const seatId = seatData.seatId || uuidv4();

                  return {
                    PutRequest: {
                      Item: {
                        seatId,
                        categoryId,
                        floorId,
                        venueId,
                        rowLabel: seatData.rowLabel || seatData.row || "",
                        colNumber: seatData.colNumber || seatData.number || 0,
                        seatCode:
                          seatData.seatCode ||
                          `${seatData.rowLabel || seatData.row || ""}${seatData.colNumber || seatData.number || ""}`,
                        seatType: seatData.seatType || "standard",
                        status: seatData.status || "available",
                        isAccessible: seatData.isAccessible || false,
                        notes: seatData.notes || "",
                        createdAt: now,
                        createdBy: userId,
                      },
                    },
                  };
                });

                await dynamodb
                  .batchWrite({
                    RequestItems: {
                      [tableName('VENUE_SEAT_TABLE', 'Venue_Seat')]: putRequests,
                    },
                  })
                  .promise();

                seats.push(...batch.map((s) => s.seatId || uuidv4()));
              }
            }

            categories.push({
              categoryId,
              name: categoryData.name,
              seatCount: seats.length,
            });
          }
        }

        floors.push({
          floorId,
          name: floorData.name,
          categoryCount: categories.length,
          elementCount: elements.length,
          categories,
        });
      }
    }

    // Procesar categorías independientes (aplica a templates, base y venues de evento)
    let ticketRecord = null;
    const allTicketCategories = [];

    // Prioridad 1: Array independiente 'categories' (nuevo formato)
    if (body.categories && Array.isArray(body.categories)) {
      console.log(
        `Procesando ${body.categories.length} categorías independientes...`,
      );
      for (const cat of body.categories) {
        const categoryId = cat.categoryId || cat.id || uuidv4();

        const ticketQuantityRaw =
          cat.cantidadTickets !== undefined
            ? cat.cantidadTickets
            : cat.quantity !== undefined
              ? cat.quantity
              : cat.totalSeats !== undefined
                ? cat.totalSeats
                : 0;
        const ticketQuantity = Number.isFinite(Number(ticketQuantityRaw))
          ? Number(ticketQuantityRaw)
          : 0;

        // Crear categoría en Venue_Category (siempre)
        // Si hasSeating y tiene floorId, vincular; si no, crear sin floor
        const category = {
          categoryId,
          ...(hasSeating && cat.floorId && { floorId: cat.floorId }),
          venueId,
          ...(eventId && { eventId }),
          name: cat.name || cat.categoria,
          color: cat.color || "#000000",
          level: cat.level || 0,
          sortOrder: cat.sortOrder || 0,
          gateId: cat.gateId || null,
          gateName: cat.gateName || "",
          relX: cat.relX || 0,
          relY: cat.relY || 0,
          width: cat.width || 0,
          height: cat.height || 0,
          geometry: cat.geometry || "RECTANGLE",
          zIndex: cat.zIndex !== undefined ? cat.zIndex : 0,
          rotation: cat.rotation !== undefined ? cat.rotation : 0,
          config: cat.config || "",
          isAccessibleZone: cat.isAccessibleZone || false,
          description: cat.descripcion || cat.description || "",
          rows: cat.rows || 0,
          seatsPerRow: cat.seatsPerRow || 0,
          ringThickness: cat.ringThickness !== undefined ? cat.ringThickness : 55,
          colOrder: cat.colOrder || null,
          rowOrder: cat.rowOrder || null,
          ticketQuantity,
          cantidadTickets: ticketQuantity,
          availableCapacity: ticketQuantity,
          hasPrice:
            cat.hasPrice !== undefined
              ? cat.hasPrice
              : typeof cat.costo === "boolean"
                ? cat.costo
                : false,
          costo:
            typeof cat.costo === "boolean"
              ? cat.costo
              : cat.costo !== undefined
                ? cat.costo
                : cat.cost !== undefined
                  ? cat.cost
                  : false,
          valor:
            cat.valor !== undefined
              ? cat.valor
              : cat.price !== undefined
                ? cat.price
                : 0,
          moneda: cat.moneda || cat.currency || "COP",
          currency: cat.currency || cat.moneda || "COP",
          ticketPrice:
            cat.ticketPrice !== undefined
              ? cat.ticketPrice
              : cat.valor !== undefined
                ? cat.valor
                : cat.price || 0,
          floorNumber: cat.floorNumber || 1,
          totalSeats: cat.totalSeats || 0,
          disableSeatsEnabled: cat.disableSeatsEnabled || false,
          createDate: now,
          createdBy: userId,
        };

        await dynamodb
          .put({
            TableName: tableName('VENUE_CATEGORY_TABLE', 'Venue_Category'),
            Item: category,
          })
          .promise();

        // Procesar seats solo si hasSeating es true
        if (hasSeating && cat.floorId) {
          const resolvedSeats = resolveCategorySeats(cat, categoryId);
          if (!Array.isArray(resolvedSeats) || resolvedSeats.length === 0) {
            continue;
          }
          const batchSize = 25;
          for (let i = 0; i < resolvedSeats.length; i += batchSize) {
            const batch = resolvedSeats.slice(i, i + batchSize);
            const putRequests = batch.map((seatData) => {
              const seatId = seatData.seatId || uuidv4();
              return {
                PutRequest: {
                  Item: {
                    seatId,
                    categoryId,
                    ...(cat.floorId && { floorId: cat.floorId }),
                    venueId,
                    rowLabel: seatData.row || seatData.rowLabel || "",
                    colNumber: seatData.number || seatData.colNumber || 0,
                    seatCode:
                      seatData.seatCode || `${seatData.row}${seatData.number}`,
                    seatType: seatData.seatType || "standard",
                    status: seatData.status || "available",
                    isAccessible: seatData.isAccessible || false,
                    notes: seatData.notes || "",
                    createdAt: now,
                    createdBy: userId,
                  },
                },
              };
            });

            await dynamodb
              .batchWrite({
                RequestItems: {
                  [tableName('VENUE_SEAT_TABLE', 'Venue_Seat')]: putRequests,
                },
              })
              .promise();
          }
        }

        // Agregar a tickets para tabla Tickets (solo si hay eventId)
        allTicketCategories.push({
          categoria: cat.name || cat.categoria,
          id: categoryId,
          cantidadTickets: ticketQuantity,
          avaliableCapacity: ticketQuantity,
          reservedTickets: 0,
          soldTickets: 0,
          moneda: cat.moneda || cat.currency || "COP",
          costo: cat.costo || cat.cost || 0,
          valor: cat.valor || cat.price || 0,
          descripcion: cat.descripcion || cat.description || "",
          imgboleta: cat.imgboleta || cat.image || "",
          color: cat.color || null,
          gateId: cat.gateId || null,
          distributionId: cat.distributionId || uuidv4(),
          distributionCreateDate: now,
        });
      }
    }
    // Prioridad 2: Categorías dentro de floors (formato antiguo - compatibilidad)
    else if (floorArray.length > 0) {
      for (const floor of floorArray) {
        if (floor.categories && Array.isArray(floor.categories)) {
          for (const cat of floor.categories) {
            if (cat.ticketCategory) {
              allTicketCategories.push({
                categoria: cat.ticketCategory.categoria || cat.name,
                id: cat.ticketCategory.id || cat.categoryId || uuidv4(),
                cantidadTickets: cat.ticketCategory.cantidadTickets || 0,
                avaliableCapacity: cat.ticketCategory.cantidadTickets || 0,
                reservedTickets: 0,
                soldTickets: 0,
                moneda: cat.ticketCategory.moneda || "COP",
                costo: cat.ticketCategory.costo || 0,
                valor: cat.ticketCategory.valor || 0,
                descripcion: cat.ticketCategory.descripcion || "",
                imgboleta: cat.ticketCategory.imgboleta || "",
                color: cat.ticketCategory.color || cat.color || null,
                gateId: cat.ticketCategory.gateId || cat.gateId || null,
                distributionId: cat.ticketCategory.distributionId || uuidv4(),
                distributionCreateDate: now,
              });
            }
          }
        }
      }
    }

    // Guardar en tabla Tickets si hay categorías y el venue es de evento
    if (eventId && allTicketCategories.length > 0) {
      const ticketId = uuidv4().substring(0, 10);
      const saleWindow = resolveTicketSaleWindow({
        body,
        eventData: eventSaleWindow,
        fallbackStartDate: eventSaleWindow?.fechaIni || body.fechaIni || now,
        fallbackEndDate: eventSaleWindow?.fechaFin || body.fechaFin || now,
      });

      ticketRecord = {
        id: ticketId,
        eventId: eventId,
        venueId: venueId,
        boletas: allTicketCategories,
        fechaIniVent: saleWindow.fechaIniVent,
        fechaFinVent: saleWindow.fechaFinVent,
        horaIniVent: saleWindow.horaIniVent,
        horaFinVent: saleWindow.horaFinVent,
        createDate: now,
        hasSeating: hasSeating,
      };

      await dynamodb
        .put({
          TableName: tableName('TICKETS_TABLE', 'Tickets'),
          Item: ticketRecord,
        })
        .promise();

      // Generar TicketsDistribution SOLO para venues de eventos (isEventVenue=true)
      // Para templates/base venues, no se generan distribuciones
      if (isEventVenue) {
        try {
          let seatsMapping = {};
          if (hasSeating) {
            // Construir mapping categoryId -> seats desde Venue_Seat
            seatsMapping = await buildSeatsMappingForCategories(
              venueId,
              allTicketCategories.map((c) => c.id),
            );
          }

          await generateTicketsDistribution(
            eventId,
            venueId,
            ticketId,
            allTicketCategories,
            now,
            seatsMapping,
          );
          console.log(
            `✅ TicketsDistribution creadas en createVenue para ticketId: ${ticketId}`,
          );
        } catch (distErr) {
          console.error(
            "⚠️ Error generando TicketsDistribution en createVenue:",
            distErr,
          );
        }
      } else {
        console.log(
          `ℹ️ Venue es template/base - NO se generan TicketsDistribution`,
        );
      }

      await notifyLifecycleScheduler(eventId);
    }

    const { notifyContentCreated } = require("./coAdminUtils");
    await notifyContentCreated({
      templateKey: "VENUE_CREATED",
      userId: body.ownerUserId,
      entityId: venueId,
      entityName: venue.name,
      entityType: "VENUE",
    });

    if (!isEventVenue && body.ownerUserId) {
      const clientTable = tableName("CLIENT_TABLE", "Client-qa");
      try {
        await dynamodb.update({
          TableName: clientTable,
          Key: { id: body.ownerUserId },
          UpdateExpression: "SET placesPublishedThisYear = if_not_exists(placesPublishedThisYear, :zero) + :one, updatedAt = :now",
          ExpressionAttributeValues: {
            ":zero": 0,
            ":one": 1,
            ":now": now,
          },
        }).promise();
      } catch (clientErr) {
        console.warn("[createVenue] No se pudo incrementar placesPublishedThisYear:", clientErr.message);
      }
    }

    return respond(201, {
      message: "Venue created successfully",
      venue: {
        venueId,
        name: venue.name,
        type: venue.type,
        capacity: venue.capacity,
        eventId: venue.eventId,
        isEventVenue: venue.isEventVenue,
        hasSeating: venue.hasSeating,
        baseVenueId: venue.baseVenueId,
        floorCount: floors.length,
        floors,
        gateCount: gates.length,
        gates,
        ticketRecord: ticketRecord
          ? {
              ticketId: ticketRecord.id,
              categoriesCount: ticketRecord.boletas.length,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error in createVenueHandler:", error);
    return respond(500, {
      error: "Internal server error",
      message: error.message,
    });
  }
};

// Helper: construir mapping de sillas por categoría
async function buildSeatsMappingForCategories(venueId, categoryIds) {
  const mapping = {};
  for (const categoryId of categoryIds) {
    const res = await dynamodb
      .query({
        TableName: tableName('VENUE_SEAT_TABLE', 'Venue_Seat'),
        IndexName: "categoryIdIndex",
        KeyConditionExpression: "categoryId = :categoryId",
        ExpressionAttributeValues: { ":categoryId": categoryId },
      })
      .promise();
    const seats = res.Items || [];
    seats.sort((a, b) => {
      const ra = (a.rowLabel || "").toString();
      const rb = (b.rowLabel || "").toString();
      if (ra === rb) return (a.colNumber || 0) - (b.colNumber || 0);
      return ra.localeCompare(rb, undefined, { numeric: true });
    });
    mapping[categoryId] = seats.map((s) => ({
      seatId: s.seatId,
      rowLabel: s.rowLabel || "",
      colNumber: s.colNumber || 0,
      seatLabel: s.seatLabel || `${s.rowLabel || ""}${s.colNumber || ""}`,
      floorId: s.floorId || null,
      venueId: venueId,
    }));
  }
  return mapping;
}
