const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const lambda = new AWS.Lambda();
const { v4: uuidv4 } = require("uuid");
// Reusar generator de TicketsDistribution del handler de clonación
const {
  generateTicketsDistribution,
  getEventSaleWindowSource,
  resolveTicketSaleWindow,
} = require("./cloneVenueForEventHandler");
const {
  resolveCategorySeats,
  shouldSkipGridSeatSync,
  pickLabelLayoutFields,
} = require("./seatGridUtils");

const BUCKET_NAME = process.env.VENUE_IMAGES_BUCKET || "doevent-venue-images";
const EVENT_LIFECYCLE_SCHEDULER_UPSERT_FUNCTION =
  process.env.EVENT_LIFECYCLE_SCHEDULER_UPSERT_FUNCTION ||
  "events-lifecycle-manager-scheduler-upsert";

const tableName = (envKey, fallback) => process.env[envKey] || fallback;
const TABLES = {
  VENUE: () => tableName("VENUE_TABLE", "Venues"),
  VENUE_FLOOR: () => tableName("VENUE_FLOOR_TABLE", "Venue_Floor"),
  VENUE_ELEMENT: () => tableName("VENUE_ELEMENT_TABLE", "Venue_Element"),
  VENUE_CATEGORY: () => tableName("VENUE_CATEGORY_TABLE", "Venue_Category"),
  VENUE_SEAT: () => tableName("VENUE_SEAT_TABLE", "Venue_Seat"),
  VENUE_GATE: () => tableName("VENUE_GATE_TABLE", "Venue_Gate"),
  TICKETS: () => tableName("TICKETS_TABLE", "Tickets"),
  TICKETS_DIST: () => tableName("TICKETS_DIST_TABLE", "TicketsDistribution"),
  EVENTS: () => tableName("EVENTS_TABLE", "Eventos"),
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

const hasTicketSalesWindowUpdates = (body = {}) =>
  body.fechaIniVent !== undefined ||
  body.fechaFinVent !== undefined ||
  body.horaIniVent !== undefined ||
  body.horaFinVent !== undefined ||
  body.salesStartAt !== undefined ||
  body.salesEndAt !== undefined;

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
      `[updateVenue] No se pudo reconciliar lifecycle scheduler para eventId=${eventId}: ${error.message}`,
    );
  }
};

const normalizeIncomingImageUrls = (images) => {
  if (!Array.isArray(images)) return [];

  const urls = images
    .map((img) => {
      if (!img) return null;

      if (typeof img === "string") {
        return img.trim() || null;
      }

      if (typeof img === "object") {
        return (
          img.url ||
          img.imageUrl ||
          img.signedUrl ||
          img.publicUrl ||
          img.uri ||
          null
        );
      }

      return null;
    })
    .filter((url) => typeof url === "string" && /^https?:\/\//i.test(url));

  return [...new Set(urls)];
};

const resolveElementImageSource = (elementData = {}) =>
  elementData.image ||
  elementData.imageUrl ||
  elementData.url ||
  elementData.uri ||
  elementData.src ||
  elementData.signedUrl ||
  "";

/**
 * Handler mejorado para actualizar venues con comparación inteligente
 * Soporta:
 * - Comparación de datos existentes vs nuevos
 * - Eliminación en batch de categorías, pisos y sillas
 * - Actualización masiva de elementos
 * - Sincronización con tabla Tickets
 */
exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));
    const { venueId } = event.pathParameters;
    const body = JSON.parse(event.body);
    const userId =
      event.requestContext?.authorizer?.claims?.sub ||
      body.userId ||
      body.updatedBy ||
      body.ownerUserId;

    console.log("userId extracted:", userId);

    if (!venueId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "venueId is required" }),
      };
    }

    // Verificar que el venue exists y obtener datos actuales
    const existing = await dynamodb
      .get({
        TableName: TABLES.VENUE(),
        Key: { venue_id: venueId },
      })
      .promise();

    if (!existing.Item) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Venue not found" }),
      };
    }

    const { canEditEntity } = require("./coAdminUtils");
    if (!canEditEntity(userId, existing.Item.ownerUserId, existing.Item.coAdminIds)) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Sin permiso para editar este lugar" }),
      };
    }

    const now = new Date().toISOString();
    const hasSeating =
      body.hasSeating !== undefined
        ? body.hasSeating
        : existing.Item.hasSeating;
    const eventId = body.eventId || existing.Item.eventId;
    const eventSaleWindow = eventId
      ? await getEventSaleWindowSource(eventId)
      : null;

    // PARTE 0: PROCESAR IMÁGENES EN BASE64 (antes de actualizar campos)
    const uploadedImageUrls = await processBase64Images(
      venueId,
      body,
      existing.Item,
      now,
    );

    const incomingDirectImageUrls = normalizeIncomingImageUrls(body.images);

    // Normalizar actualización de imágenes para soportar arrays de URLs/objetos y base64
    if (Array.isArray(body.images)) {
      const allImageUrls = [...new Set([...incomingDirectImageUrls, ...uploadedImageUrls])];
      body.images = allImageUrls.join(",");
      console.log(
        `✅ Imágenes normalizadas desde array: ${allImageUrls.length}`,
      );
    } else if (uploadedImageUrls.length > 0) {
      const existingImages = existing.Item.images || "";
      const existingUrls = existingImages
        ? existingImages.split(",").map((url) => url.trim()).filter(Boolean)
        : [];
      const allImageUrls = [...new Set([...existingUrls, ...uploadedImageUrls])];
      body.images = allImageUrls.join(",");
      console.log(`✅ Total de imágenes después de subir: ${allImageUrls.length}`);
    }

    // Limpiar imageBase64 del body para que no intente guardarlo en DB
    if (body.imageBase64) {
      delete body.imageBase64;
      console.log("🧹 Campo imageBase64 removido del body");
    }

    // PARTE 1: ACTUALIZAR CAMPOS BÁSICOS DEL VENUE
    console.log("📝 Actualizando campos básicos del venue...");
    await updateBasicVenueFields(venueId, body, existing.Item, userId, now);

    // PARTE 2: PROCESAR FLOORS (pisos) con auto-eliminación
    const floorsResult = await processFloorsWithSync(
      venueId,
      body.floors,
      hasSeating,
      userId,
      now,
      eventId,
    );

    // PARTE 3: PROCESAR CATEGORÍAS INDEPENDIENTES
    let ticketUpdateResult = null;
    if (body.categories && Array.isArray(body.categories)) {
      ticketUpdateResult = await processIndependentCategories(
        venueId,
        eventId,
        body.categories,
        hasSeating,
        userId,
        now,
        body,
        eventSaleWindow,
      );
    } else if (
      eventId &&
      Array.isArray(body.floors) &&
      body.floors.length > 0
    ) {
      // Si no viene categories independiente, pero sí floors con categorías, actualizar Tickets/TicketsDistribution desde floors
      ticketUpdateResult = await processFloorCategoriesTicketsUpdate(
        venueId,
        eventId,
        body.floors,
        hasSeating,
        userId,
        now,
        body,
        eventSaleWindow,
      );
    }

    // PARTE 4: PROCESAR ELIMINACIONES EN BATCH
    const deletionResults = await processBatchDeletions(
      venueId,
      body.deletions || {},
      eventId,
    );

    if (eventId && hasTicketSalesWindowUpdates(body)) {
      await syncTicketSalesWindowFields(eventId, body, now, eventSaleWindow);
    }

    if (eventId && (ticketUpdateResult || hasTicketSalesWindowUpdates(body))) {
      await notifyLifecycleScheduler(eventId);
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({
        message: "Venue updated successfully",
        venueId,
        hasSeating,
        eventId,
        floorsResult,
        ticketUpdate: ticketUpdateResult,
        deletions: deletionResults,
      }),
    };
  } catch (error) {
    console.error("Error in updateVenueHandler:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
        stack: error.stack,
      }),
    };
  }
};

/**
 * Actualiza solo los campos básicos del venue que han cambiado
 */
async function updateBasicVenueFields(
  venueId,
  newData,
  existingData,
  userId,
  now,
) {
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  const allowedFields = [
    "name",
    "type",
    "capacity",
    "country",
    "city",
    "address",
    "address2",
    "postalCode",
    "timezone",
    "geo",
    "amenities",
    "images",
    "tags",
    "gates",
    "isTemplate",
    "isCertified",
    "visibility",
    "status",
    "floorplanVersion",
    "hasSeating",
    "eventId",
    "isEventVenue",
    "baseVenueId",
    "latitude",
    "longitude",
    "description",
    "isOwnerOrAdmin",
  ];

  // Procesar gates antes de comparar (asegurar que cada gate tenga gateId)
  if (newData.gates && Array.isArray(newData.gates)) {
    newData.gates = newData.gates.map((gate) => ({
      ...gate,
      gateId: gate.gateId || uuidv4(),
    }));
  }

  // Comparar y agregar solo campos que han cambiado
  allowedFields.forEach((field) => {
    if (
      newData[field] !== undefined &&
      JSON.stringify(newData[field]) !== JSON.stringify(existingData[field])
    ) {
      updateExpressions.push(`#${field} = :${field}`);
      expressionAttributeNames[`#${field}`] = field;
      expressionAttributeValues[`:${field}`] = newData[field];
      console.log(`✏️ Campo modificado: ${field}`);
    }
  });

  if (updateExpressions.length > 0) {
    updateExpressions.push("#updatedAt = :updatedAt");
    expressionAttributeNames["#updatedAt"] = "updatedAt";
    expressionAttributeValues[":updatedAt"] = now;

    if (userId) {
      updateExpressions.push("#updatedBy = :updatedBy");
      expressionAttributeNames["#updatedBy"] = "updatedBy";
      expressionAttributeValues[":updatedBy"] = userId;
    }

    console.log(
      `✅ Actualizando ${updateExpressions.length - 1} campos del venue`,
    );

    await dynamodb
      .update({
        TableName: TABLES.VENUE(),
        Key: { venue_id: venueId },
        UpdateExpression: `SET ${updateExpressions.join(", ")}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      })
      .promise();
  } else {
    console.log("⚠️ No hay campos básicos para actualizar");
  }

  // Guardar/actualizar gates en tabla Venue_Gate independiente si se actualizaron
  if (
    newData.gates &&
    Array.isArray(newData.gates) &&
    newData.gates.length > 0
  ) {
    console.log(
      `🚪 Actualizando ${newData.gates.length} gates en Venue_Gate...`,
    );

    // Obtener gates existentes para este venue
    const existingGatesResult = await dynamodb
      .query({
        TableName: TABLES.VENUE_GATE(),
        IndexName: "venueIdIndex",
        KeyConditionExpression: "venueId = :venueId",
        ExpressionAttributeValues: { ":venueId": venueId },
      })
      .promise();

    const existingGates = existingGatesResult.Items || [];
    const existingGateIds = existingGates.map((g) => g.gateId);
    const newGateIds = newData.gates.map((g) => g.gateId);

    // Eliminar gates que ya no están en la nueva lista
    const gatesToDelete = existingGates.filter(
      (g) => !newGateIds.includes(g.gateId),
    );
    for (const gate of gatesToDelete) {
      await dynamodb
        .delete({
          TableName: TABLES.VENUE_GATE(),
          Key: { gateId: gate.gateId },
        })
        .promise();
    }

    // Insertar o actualizar gates
    const gatePromises = newData.gates.map((gate) => {
      const existingGate = existingGates.find((g) => g.gateId === gate.gateId);
      return dynamodb
        .put({
          TableName: TABLES.VENUE_GATE(),
          Item: {
            gateId: gate.gateId,
            venueId: venueId,
            eventId: existingData.eventId || null,
            gateNumber: gate.gateNumber,
            name: gate.name,
            description: gate.description || "",
            assignedStaff: existingGate?.assignedStaff || [],
            status: "active",
            createdAt: existingGate?.createdAt || now,
            createdBy: existingGate?.createdBy || userId,
            updatedAt: now,
            updatedBy: userId,
          },
        })
        .promise();
    });

    await Promise.all(gatePromises);
    console.log(
      `✓ ${newData.gates.length} gates guardados/actualizados en Venue_Gate (${gatesToDelete.length} eliminados)`,
    );
  }
}

/**
 * Procesa floors con sincronización automática: elimina floors que ya no están en el array
 */
async function processFloorsWithSync(
  venueId,
  newFloors,
  hasSeating,
  userId,
  now,
  eventId,
) {
  // Si no se envía el array floors, no hacer cambios (mantener existentes)
  if (newFloors === undefined) {
    console.log("⚠️ Array floors no enviado, manteniendo floors existentes");
    return {
      floorsProcessed: 0,
      categoriesProcessed: 0,
      seatsProcessed: 0,
      floorsDeleted: 0,
    };
  }

  // Si se envía array vacío, eliminar todos los floors
  if (!Array.isArray(newFloors)) {
    console.log("⚠️ floors debe ser un array");
    return {
      floorsProcessed: 0,
      categoriesProcessed: 0,
      seatsProcessed: 0,
      floorsDeleted: 0,
    };
  }

  console.log(`🏢 Procesando ${newFloors.length} floors con sincronización...`);

  // 1. Obtener floors existentes del venue
  const existingFloorsResult = await dynamodb
    .query({
      TableName: TABLES.VENUE_FLOOR(),
      IndexName: "venueIdIndex",
      KeyConditionExpression: "venueId = :venueId",
      ExpressionAttributeValues: {
        ":venueId": venueId,
      },
    })
    .promise();

  const existingFloorIds = (existingFloorsResult.Items || []).map(
    (f) => f.floorId,
  );
  const newFloorIds = newFloors.map((f) => f.floorId).filter((id) => id); // Solo IDs existentes

  // 2. Detectar floors a eliminar (existen pero no están en el nuevo array)
  const floorsToDelete = existingFloorIds.filter(
    (id) => !newFloorIds.includes(id),
  );

  if (floorsToDelete.length > 0) {
    console.log(
      `🗑️ Auto-eliminando ${floorsToDelete.length} floors que ya no están en el array:`,
      floorsToDelete,
    );
    for (const floorId of floorsToDelete) {
      await deleteFloor(floorId, venueId);
    }
  }

  // 3. Procesar floors del array (crear/actualizar)
  if (newFloors.length === 0) {
    console.log("✅ Array floors vacío - todos los floors eliminados");
    return {
      floorsProcessed: 0,
      categoriesProcessed: 0,
      seatsProcessed: 0,
      floorsDeleted: floorsToDelete.length,
    };
  }

  console.log(`🏢 Procesando ${newFloors.length} floors...`);

  const floorsResult = [];
  let totalCategories = 0;
  let totalSeats = 0;

  for (const floorData of newFloors) {
    const floorId = floorData.floorId || uuidv4();
    const isNewFloor = !floorData.floorId;

    // Crear o actualizar floor
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
      updatedAt: now,
      updatedBy: userId,
    };

    if (isNewFloor) {
      floor.createdAt = now;
      floor.createdBy = userId;
      console.log(`➕ Creando nuevo floor: ${floorData.name}`);
    } else {
      console.log(`✏️ Actualizando floor: ${floorData.name}`);
    }

    await dynamodb
      .put({
        TableName: TABLES.VENUE_FLOOR(),
        Item: floor,
      })
      .promise();

    // Procesar elementos del floor
    if (floorData.elements && Array.isArray(floorData.elements)) {
      await processFloorElements(
        floorId,
        venueId,
        floorData.elements,
        userId,
        now,
      );
    }

    // Procesar categorías del floor
    const categoriesResult = await processFloorCategories(
      floorId,
      venueId,
      eventId,
      floorData.categories || [],
      hasSeating,
      userId,
      now,
    );

    totalCategories += categoriesResult.categoriesProcessed;
    totalSeats += categoriesResult.seatsProcessed;

    floorsResult.push({
      floorId,
      name: floorData.name,
      action: isNewFloor ? "created" : "updated",
      ...categoriesResult,
    });
  }

  return {
    floorsProcessed: newFloors.length,
    categoriesProcessed: totalCategories,
    seatsProcessed: totalSeats,
    floors: floorsResult,
  };
}

/**
 * Procesa elementos de un floor (elementos decorativos, etc) con sincronización
 */
async function processFloorElements(floorId, venueId, elements, userId, now) {
  // Si elements es undefined, no hacer cambios
  if (elements === undefined) {
    console.log(
      `⚠️ Array elements no enviado para floor ${floorId}, manteniendo existentes`,
    );
    return;
  }

  if (!Array.isArray(elements)) {
    console.log(`⚠️ elements debe ser un array para floor ${floorId}`);
    return;
  }

  // 1. Obtener elementos existentes del floor
  // Solo hacer query si floorId no es null
  let existingElementsResult;
  if (floorId) {
    existingElementsResult = await dynamodb
      .query({
        TableName: TABLES.VENUE_ELEMENT(),
        IndexName: "floorIdIndex",
        KeyConditionExpression: "floorId = :floorId",
        ExpressionAttributeValues: {
          ":floorId": floorId,
        },
      })
      .promise();
  } else {
    existingElementsResult = { Items: [] };
  }

  const existingElementIds = (existingElementsResult.Items || []).map(
    (e) => e.elementId,
  );
  const newElementIds = elements.map((e) => e.elementId).filter((id) => id);

  // 2. Detectar elementos a eliminar
  const elementsToDelete = existingElementIds.filter(
    (id) => !newElementIds.includes(id),
  );

  if (elementsToDelete.length > 0) {
    console.log(
      `🗑️ Auto-eliminando ${elementsToDelete.length} elementos del floor ${floorId}`,
    );
    const batchSize = 25;
    for (let i = 0; i < elementsToDelete.length; i += batchSize) {
      const batch = elementsToDelete.slice(i, i + batchSize);
      const deleteRequests = batch.map((elementId) => ({
        DeleteRequest: {
          Key: { elementId },
        },
      }));

      await dynamodb
        .batchWrite({
          RequestItems: {
            [TABLES.VENUE_ELEMENT()]: deleteRequests,
          },
        })
        .promise();
    }
  }

  // 3. Si array vacío, solo eliminamos
  if (elements.length === 0) {
    console.log(
      `✅ Array elements vacío - todos los elementos eliminados del floor ${floorId}`,
    );
    return;
  }

  console.log(
    `🎨 Procesando ${elements.length} elementos para floor ${floorId}`,
  );

  const batchSize = 25;
  for (let i = 0; i < elements.length; i += batchSize) {
    const batch = elements.slice(i, i + batchSize);

    const putRequests = batch.map((elementData) => {
      const elementId = elementData.elementId || uuidv4();
      const isNew = !elementData.elementId;
      const image = resolveElementImageSource(elementData);

      if (
        (elementData.geometry === "IMAGEN" || elementData.type === "IMAGEN") &&
        !image
      ) {
        console.warn(`⚠️ Elemento IMAGEN sin fuente de imagen (elementId=${elementId})`);
      }

      return {
        PutRequest: {
          Item: {
            elementId,
            floorId,
            venueId,
            name: elementData.name,
            type: elementData.type || elementData.geometry || "other",
            relX: elementData.relX || 0,
            relY: elementData.relY || 0,
            width: elementData.width || 0,
            height: elementData.height || 0,
            geometry: elementData.geometry || "RECTANGLE",
            position: elementData.position || "",
            zIndex: elementData.zIndex !== undefined ? elementData.zIndex : 0,
            rotation:
              elementData.rotation !== undefined ? elementData.rotation : 0,
            image,
            horseshoeCurvature: elementData.horseshoeCurvature !== undefined ? elementData.horseshoeCurvature : 0,
            ...pickLabelLayoutFields(elementData),
            textColor: elementData.textColor || "",
            textFontWeight: elementData.textFontWeight || "",
            textFontFamily: elementData.textFontFamily || "",
            textFontSize: elementData.textFontSize !== undefined ? elementData.textFontSize : 0,
            notes: elementData.notes || "",
            updatedAt: now,
            updatedBy: userId,
            createdAt: isNew ? now : elementData.createdAt || now,
            createdBy: isNew ? userId : elementData.createdBy || userId,
          },
        },
      };
    });

    await dynamodb
      .batchWrite({
        RequestItems: {
          [TABLES.VENUE_ELEMENT()]: putRequests,
        },
      })
      .promise();
  }

  console.log(`✅ ${elements.length} elementos procesados`);
}

/**
 * Procesa categorías de un floor específico con sincronización
 */
async function processFloorCategories(
  floorId,
  venueId,
  eventId,
  categories,
  hasSeating,
  userId,
  now,
) {
  // Si categories es undefined, no hacer cambios
  if (categories === undefined) {
    console.log(
      `⚠️ Array categories no enviado para floor ${floorId}, manteniendo existentes`,
    );
    return { categoriesProcessed: 0, seatsProcessed: 0 };
  }

  if (!Array.isArray(categories)) {
    console.log(`⚠️ categories debe ser un array para floor ${floorId}`);
    return { categoriesProcessed: 0, seatsProcessed: 0 };
  }

  // 1. Obtener categorías existentes del floor
  // Solo hacer query si floorId no es null (evitar error en índice)
  let existingCategoriesResult;
  if (floorId) {
    existingCategoriesResult = await dynamodb
      .query({
        TableName: TABLES.VENUE_CATEGORY(),
        IndexName: "floorIdIndex",
        KeyConditionExpression: "floorId = :floorId",
        ExpressionAttributeValues: {
          ":floorId": floorId,
        },
      })
      .promise();
  } else {
    // Si floorId es null, no hay categorías existentes del floor
    existingCategoriesResult = { Items: [] };
  }

  const existingCategoryIds = (existingCategoriesResult.Items || []).map(
    (c) => c.categoryId,
  );
  const newCategoryIds = categories.map((c) => c.categoryId).filter((id) => id);

  // 2. Detectar categorías a eliminar
  const categoriesToDelete = existingCategoryIds.filter(
    (id) => !newCategoryIds.includes(id),
  );

  if (categoriesToDelete.length > 0) {
    console.log(
      `🗑️ Auto-eliminando ${categoriesToDelete.length} categorías del floor ${floorId}`,
    );

    // Eliminar seats de cada categoría primero
    for (const categoryId of categoriesToDelete) {
      await deleteCategorySeats(categoryId);
    }

    // Eliminar categorías en batch
    const batchSize = 25;
    for (let i = 0; i < categoriesToDelete.length; i += batchSize) {
      const batch = categoriesToDelete.slice(i, i + batchSize);
      const deleteRequests = batch.map((categoryId) => ({
        DeleteRequest: {
          Key: { categoryId },
        },
      }));

      await dynamodb
        .batchWrite({
          RequestItems: {
            [TABLES.VENUE_CATEGORY()]: deleteRequests,
          },
        })
        .promise();
    }
  }

  // 3. Si array vacío, solo eliminamos
  if (categories.length === 0) {
    console.log(
      `✅ Array categories vacío - todas las categorías eliminadas del floor ${floorId}`,
    );
    return { categoriesProcessed: 0, seatsProcessed: 0 };
  }

  console.log(
    `📦 Procesando ${categories.length} categorías para floor ${floorId}`,
  );

  let totalSeats = 0;
  const existingById = Object.fromEntries(
    (existingCategoriesResult.Items || []).map((item) => [item.categoryId, item]),
  );

  for (const categoryData of categories) {
    const categoryId = categoryData.categoryId || uuidv4();
    const existingCat = existingById[categoryId];
    const isNew = !existingCat;

    const category = {
      categoryId,
      floorId,
      venueId,
      eventId,
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
      zIndex: categoryData.zIndex !== undefined ? categoryData.zIndex : 0,
      rotation: categoryData.rotation !== undefined ? categoryData.rotation : 0,
      config: categoryData.config || "",
      isAccessibleZone: categoryData.isAccessibleZone || false,
      description: categoryData.description || "",
      rows: categoryData.rows || 0,
      seatsPerRow: categoryData.seatsPerRow || 0,
      disabledSeats: Array.isArray(categoryData.disabledSeats)
        ? categoryData.disabledSeats
        : [],
      colOrder: categoryData.colOrder || null,
      rowOrder: categoryData.rowOrder || null,
      ...pickLabelLayoutFields(categoryData, existingCat || {}),
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
            : categoryData.cost !== undefined
              ? categoryData.cost
              : false,
      valor:
        categoryData.valor !== undefined
          ? categoryData.valor
          : categoryData.price !== undefined
            ? categoryData.price
            : 0,
      moneda: categoryData.moneda || categoryData.currency || "COP",
      currency: categoryData.currency || categoryData.moneda || "COP",
      ticketPrice:
        categoryData.ticketPrice !== undefined
          ? categoryData.ticketPrice
          : categoryData.valor !== undefined
            ? categoryData.valor
            : categoryData.price || 0,
      floorNumber: categoryData.floorNumber || 1,
      totalSeats: categoryData.totalSeats || 0,
      disableSeatsEnabled: categoryData.disableSeatsEnabled || false,
      updatedAt: now,
      updatedBy: userId,
    };

    if (isNew) {
      category.createDate = now;
      category.createdBy = userId;
      console.log(`➕ Creando categoría: ${categoryData.name}`);
    } else {
      console.log(`✏️ Actualizando categoría: ${categoryData.name}`);
    }

    // Solo guardar en Venue_Category si hasSeating es true
    if (hasSeating) {
      await dynamodb
        .put({
          TableName: TABLES.VENUE_CATEGORY(),
          Item: category,
        })
        .promise();
    }

    // Procesar asientos de la categoría con sincronización
    if (hasSeating) {
      let seatsForSync;
      if (shouldSkipGridSeatSync(existingCat, categoryData)) {
        console.log(
          `⏭️ Grilla sin cambios para categoría ${categoryId}, omitiendo sync de asientos`,
        );
        seatsForSync = undefined;
      } else {
        seatsForSync = resolveCategorySeats(categoryData, categoryId);
      }

      const seatsCount = await processSeatsWithSync(
        categoryId,
        floorId,
        venueId,
        seatsForSync,
        userId,
        now,
        { skipExistingLookup: isNew },
      );
      totalSeats += seatsCount;
    }
  }

  return {
    categoriesProcessed: categories.length,
    seatsProcessed: totalSeats,
  };
}

/**
 * Procesa asientos en batch para una categoría con sincronización
 */
async function dynamoBatchWriteParallel(tableName, requests, concurrency = 12) {
  if (!requests.length) return;
  const batchSize = 25;
  const batches = [];
  for (let i = 0; i < requests.length; i += batchSize) {
    batches.push(requests.slice(i, i + batchSize));
  }
  for (let i = 0; i < batches.length; i += concurrency) {
    await Promise.all(
      batches.slice(i, i + concurrency).map((batch) =>
        dynamodb
          .batchWrite({
            RequestItems: {
              [tableName]: batch,
            },
          })
          .promise(),
      ),
    );
  }
}

async function processSeatsWithSync(
  categoryId,
  floorId,
  venueId,
  seats,
  userId,
  now,
  options = {},
) {
  // Si seats es undefined, no hacer cambios
  if (seats === undefined) {
    console.log(
      `⚠️ Array seats no enviado para categoría ${categoryId}, manteniendo existentes`,
    );
    return 0;
  }

  if (!Array.isArray(seats)) {
    console.log(`⚠️ seats debe ser un array para categoría ${categoryId}`);
    return 0;
  }

  // 1. Obtener seats existentes de la categoría
  let existingSeatIds = [];
  if (!options.skipExistingLookup) {
    const existingSeatsResult = await dynamodb
      .query({
        TableName: TABLES.VENUE_SEAT(),
        IndexName: "categoryIdIndex",
        KeyConditionExpression: "categoryId = :categoryId",
        ExpressionAttributeValues: {
          ":categoryId": categoryId,
        },
      })
      .promise();

    existingSeatIds = (existingSeatsResult.Items || []).map((s) => s.seatId);
  }
  const newSeatIds = seats.map((s) => s.seatId).filter((id) => id);

  // 2. Detectar seats a eliminar
  const seatsToDelete = existingSeatIds.filter(
    (id) => !newSeatIds.includes(id),
  );

  if (seatsToDelete.length > 0) {
    console.log(
      `🗑️ Auto-eliminando ${seatsToDelete.length} asientos de la categoría ${categoryId}`,
    );
    const deleteRequests = seatsToDelete.map((seatId) => ({
      DeleteRequest: {
        Key: { seatId },
      },
    }));
    await dynamoBatchWriteParallel(TABLES.VENUE_SEAT(), deleteRequests);
  }

  // 3. Si array vacío, solo eliminamos
  if (seats.length === 0) {
    console.log(
      `✅ Array seats vacío - todos los asientos eliminados de categoría ${categoryId}`,
    );
    return 0;
  }

  console.log(
    `💺 Procesando ${seats.length} asientos para categoría ${categoryId}`,
  );

  const putRequests = seats.map((seatData) => {
    const seatId = seatData.seatId || uuidv4();
    const isNew = !seatData.seatId;

    return {
      PutRequest: {
        Item: {
          seatId,
          sectionId: seatData.sectionId || "",
          categoryId,
          ...(floorId && { floorId }),
          venueId,
          rowLabel: seatData.rowLabel || seatData.row || "",
          colNumber: seatData.colNumber || seatData.number || 0,
          seatCode:
            seatData.seatCode
            || `${seatData.rowLabel || seatData.row}${
              seatData.colNumber || seatData.number
            }`,
          seatType: seatData.seatType || "standard",
          status: (seatData.status || "AVAILABLE").toUpperCase(),
          isAccessible: seatData.isAccessible || false,
          notes: seatData.notes || "",
          updatedAt: now,
          updatedBy: userId,
          createdAt: isNew ? now : seatData.createdAt || now,
          createdBy: isNew ? userId : seatData.createdBy || userId,
        },
      },
    };
  });

  await dynamoBatchWriteParallel(TABLES.VENUE_SEAT(), putRequests);

  console.log(`✅ ${seats.length} asientos procesados`);
  return seats.length;
}

/**
 * Procesa categorías independientes (no asociadas a floors)
 */
async function processIndependentCategories(
  venueId,
  eventId,
  categories,
  hasSeating,
  userId,
  now,
  body,
  eventSaleWindow,
) {
  console.log(
    `📦 Procesando ${categories.length} categorías independientes...`,
  );

  // 1) Detectar y eliminar categorías independientes que no vienen en el payload
  const existingIndependentResult = await dynamodb
    .query({
      TableName: TABLES.VENUE_CATEGORY(),
      IndexName: "venueIdIndex",
      KeyConditionExpression: "venueId = :venueId",
      ExpressionAttributeValues: {
        ":venueId": venueId,
      },
      FilterExpression: "attribute_not_exists(floorId)",
    })
    .promise();

  const existingIndependentIds = (existingIndependentResult.Items || []).map(
    (c) => c.categoryId,
  );
  const incomingCategoryIds = categories
    .map((c) => c.categoryId || c.id)
    .filter((id) => id);

  const categoriesToDelete = existingIndependentIds.filter(
    (id) => !incomingCategoryIds.includes(id),
  );

  if (categoriesToDelete.length > 0) {
    console.log(
      `🗑️ Eliminando ${categoriesToDelete.length} categorías independientes no enviadas...`,
    );
    for (const categoryId of categoriesToDelete) {
      await deleteCategorySeats(categoryId);
    }

    const batchSize = 25;
    for (let i = 0; i < categoriesToDelete.length; i += batchSize) {
      const batch = categoriesToDelete.slice(i, i + batchSize);
      const deleteRequests = batch.map((categoryId) => ({
        DeleteRequest: {
          Key: { categoryId },
        },
      }));

      await dynamodb
        .batchWrite({
          RequestItems: {
            [TABLES.VENUE_CATEGORY()]: deleteRequests,
          },
        })
        .promise();
    }
  }

  const allTicketCategories = [];
  let categoriesProcessed = 0;
  let seatsProcessed = 0;

  for (const cat of categories) {
    const categoryId = cat.categoryId || cat.id || uuidv4();
    const isNew = !cat.categoryId && !cat.id;

    // Crear categoría en Venue_Category (siempre)
    // Si hasSeating y tiene floorId, vincular con floor; si no, crear sin floor
    console.log(
      `📦 Procesando categoría ${cat.name} (hasSeating: ${hasSeating}, floorId: ${cat.floorId || "none"})`,
    );

    const category = {
      categoryId,
      ...(hasSeating && cat.floorId && { floorId: cat.floorId }), // Solo incluir floorId si hasSeating y existe
      venueId,
      eventId,
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
      colOrder: cat.colOrder || null,
      rowOrder: cat.rowOrder || null,
      ...pickLabelLayoutFields(cat),
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
      updatedAt: now,
      updatedBy: userId,
    };

    // Normalizar cantidad de tickets del payload y persistir siempre
    const rawQty =
      cat.cantidadTickets !== undefined
        ? cat.cantidadTickets
        : cat.quantity !== undefined
          ? cat.quantity
          : cat.totalSeats !== undefined
            ? cat.totalSeats
            : 0;
    const normalizedQty = Number.isFinite(Number(rawQty)) ? Number(rawQty) : 0;
    category.cantidadTickets = normalizedQty;
    category.ticketQuantity = normalizedQty;
    category.availableCapacity = normalizedQty;

    if (isNew) {
      category.createDate = now;
      category.createdBy = userId;
    }

    await dynamodb
      .put({
        TableName: TABLES.VENUE_CATEGORY(),
        Item: category,
      })
      .promise();

    categoriesProcessed++;

    // Procesar seats solo si hasSeating y existen seats o grilla rows/seatsPerRow
    if (hasSeating && cat.floorId) {
      const resolvedSeats = resolveCategorySeats(cat, categoryId);
      if (resolvedSeats === undefined) {
        continue;
      }
      const count = await processSeatsWithSync(
        categoryId,
        cat.floorId,
        venueId,
        resolvedSeats,
        userId,
        now,
      );
      seatsProcessed += count;
    }

    // Determinar cantidadTickets:
    // - Si hasSeating: contar seats reales de la categoría en DB
    // - Si no hasSeating: usar valor del payload
    let finalCantidadTickets = 0;
    if (hasSeating && cat.floorId) {
      // Consultar cantidad real de seats en esta categoría
      const seatsCountResult = await dynamodb
        .query({
          TableName: TABLES.VENUE_SEAT(),
          IndexName: "categoryIdIndex",
          KeyConditionExpression: "categoryId = :categoryId",
          ExpressionAttributeValues: { ":categoryId": categoryId },
          Select: "COUNT",
        })
        .promise();
      finalCantidadTickets = seatsCountResult.Count || 0;
      console.log(
        `📊 Categoría ${cat.name}: ${finalCantidadTickets} seats en DB`,
      );
    } else {
      // Sin seating, usar valor del payload
      finalCantidadTickets =
        cat.cantidadTickets || cat.quantity || cat.totalSeats || 0;
      console.log(
        `📊 Categoría ${cat.name}: ${finalCantidadTickets} tickets del payload (sin seating)`,
      );
    }

    // Agregar a tickets (siempre)
    // Prioridad: valores del payload (valor) > valores alternativos > defaults
    const finalValor =
      cat.valor !== undefined
        ? cat.valor
        : cat.price !== undefined
          ? cat.price
          : cat.ticketPrice !== undefined
            ? cat.ticketPrice
            : 0;
    const finalCosto =
      typeof cat.costo === "boolean"
        ? cat.costo
        : cat.costo !== undefined
          ? cat.costo
          : cat.cost !== undefined
            ? cat.cost
            : false;

    allTicketCategories.push({
      categoria: cat.name || cat.categoria,
      id: categoryId,
      cantidadTickets: finalCantidadTickets,
      avaliableCapacity: finalCantidadTickets,
      reservedTickets: cat.reservedTickets || 0,
      soldTickets: cat.soldTickets || 0,
      moneda: cat.moneda || cat.currency || "COP",
      costo: finalCosto,
      valor: finalValor,
      descripcion: cat.descripcion || cat.description || "",
      imgboleta: cat.imgboleta || cat.image || "",
      color: cat.color || null,
      gateId: cat.gateId || null,
      distributionId: cat.distributionId || uuidv4(),
      distributionCreateDate: cat.distributionCreateDate || now,
    });
  }

  // Actualizar tabla Tickets
  let ticketResult = null;
  if (eventId && allTicketCategories.length > 0) {
    ticketResult = await updateTicketsTable(
      eventId,
      venueId,
      allTicketCategories,
      hasSeating,
      now,
      body,
      eventSaleWindow,
    );

    // Eliminar distribuciones de categorías removidas
    if (ticketResult?.removedCategoryIds?.length > 0) {
      await deleteDistributionsByCategoryIds(
        eventId,
        venueId,
        ticketResult.removedCategoryIds,
      );
    }
    // Intentar generar TicketsDistribution para las categorías si procede
    try {
      if (ticketResult && ticketResult.ticketId) {
        const distributionCategories =
          ticketResult.boletas && ticketResult.boletas.length > 0
            ? ticketResult.boletas
            : allTicketCategories;

        // Solo regenerar distribuciones de categorías nuevas o con cantidadTickets cambiado
        const changedIds = new Set(ticketResult.changedCategoryIds || distributionCategories.map((c) => c.id));
        const categoriesToRegenerate = distributionCategories.filter((c) => changedIds.has(c.id));

        if (categoriesToRegenerate.length === 0) {
          console.log(`⏭️ Ninguna categoría cambió cantidad de tickets, omitiendo generateTicketsDistribution`);
        } else {
          console.log(
            `🚀 Generando TicketsDistribution (update) para ${categoriesToRegenerate.length}/${distributionCategories.length} categorías, ticketId: ${ticketResult.ticketId}`,
          );
          // Construir seatsMapping desde Venue_Seat si el venue tiene sillas
          let seatsMapping = {};
          if (hasSeating) {
            seatsMapping = await buildSeatsMappingForCategories(
              venueId,
              categoriesToRegenerate.map((c) => c.id),
            );
          }

          await generateTicketsDistribution(
            eventId,
            venueId,
            ticketResult.ticketId,
            categoriesToRegenerate,
            now,
            seatsMapping,
          );
          console.log(
            `✅ TicketsDistribution generadas (update) para ticketId: ${ticketResult.ticketId}`,
          );
        }
        await applyPriceOnlyDistributionSync(
          eventId,
          venueId,
          ticketResult,
          distributionCategories,
          categoriesToRegenerate.map((c) => c.id),
        );
        await applyGateOnlyDistributionSync(
          eventId,
          venueId,
          ticketResult,
          distributionCategories,
          categoriesToRegenerate.map((c) => c.id),
        );
      }
    } catch (genErr) {
      console.error(
        "⚠️ Error generando TicketsDistribution en updateVenue:",
        genErr,
      );
      // No fallar la actualización del venue por esto; solo loguear
    }
  }

  return {
    ...ticketResult,
    categoriesProcessed,
    seatsProcessed,
  };
}

/**
 * Procesa categorías desde floors y actualiza Tickets/TicketsDistribution
 * (cuando no se envía el array independiente categories)
 */
async function processFloorCategoriesTicketsUpdate(
  venueId,
  eventId,
  floors,
  hasSeating,
  userId,
  now,
  body,
  eventSaleWindow,
) {
  console.log(
    `🎟️ Actualizando tickets desde floors (${floors.length} floors)...`,
  );

  const baseCategories = [];
  for (const floor of floors) {
    if (!floor.categories || !Array.isArray(floor.categories)) {
      continue;
    }
    for (const cat of floor.categories) {
      const categoryId =
        cat.categoryId || cat.id || cat.ticketCategory?.id || uuidv4();

      const baseCategory = {
        categoria:
          cat.name || cat.categoria || cat.ticketCategory?.categoria || "",
        id: categoryId,
        cantidadTickets:
          cat.cantidadTickets ||
          cat.quantity ||
          cat.totalSeats ||
          cat.ticketCategory?.cantidadTickets ||
          0,
        avaliableCapacity:
          cat.cantidadTickets ||
          cat.quantity ||
          cat.totalSeats ||
          cat.ticketCategory?.cantidadTickets ||
          0,
        reservedTickets:
          cat.reservedTickets || cat.ticketCategory?.reservedTickets || 0,
        soldTickets: cat.soldTickets || cat.ticketCategory?.soldTickets || 0,
        moneda:
          cat.moneda || cat.currency || cat.ticketCategory?.moneda || "COP",
        costo:
          typeof cat.costo === "boolean"
            ? cat.costo
            : cat.costo !== undefined
              ? cat.costo
              : cat.cost !== undefined
                ? cat.cost
                : cat.ticketCategory?.costo || false,
        valor:
          cat.valor !== undefined
            ? cat.valor
            : cat.ticketPrice !== undefined
              ? cat.ticketPrice
              : cat.price !== undefined
                ? cat.price
                : cat.ticketCategory?.valor || 0,
        descripcion:
          cat.descripcion ||
          cat.description ||
          cat.ticketCategory?.descripcion ||
          "",
        imgboleta:
          cat.imgboleta || cat.image || cat.ticketCategory?.imgboleta || "",
        color: cat.color || cat.ticketCategory?.color || null,
        gateId: cat.gateId || cat.ticketCategory?.gateId || null,
        distributionId:
          cat.distributionId || cat.ticketCategory?.distributionId || uuidv4(),
        distributionCreateDate:
          cat.distributionCreateDate ||
          cat.ticketCategory?.distributionCreateDate ||
          now,
      };

      baseCategories.push(baseCategory);
    }
  }

  if (baseCategories.length === 0) {
    console.log("⚠️ No hay categorías en floors para actualizar tickets");
    return null;
  }

  // Ajustar cantidadTickets en venues con sillas (usar conteo real de Venue_Seat)
  let seatsMapping = {};
  if (hasSeating) {
    seatsMapping = await buildSeatsMappingForCategories(
      venueId,
      baseCategories.map((c) => c.id),
    );
    baseCategories.forEach((c) => {
      const seats = seatsMapping[c.id] || [];
      c.cantidadTickets = seats.length;
      c.avaliableCapacity = seats.length;
    });
  }

  const ticketResult = await updateTicketsTable(
    eventId,
    venueId,
    baseCategories,
    hasSeating,
    now,
    body,
    eventSaleWindow,
  );

  // Eliminar distribuciones de categorías removidas
  if (ticketResult?.removedCategoryIds?.length > 0) {
    await deleteDistributionsByCategoryIds(
      eventId,
      venueId,
      ticketResult.removedCategoryIds,
    );
  }

  // Generar/actualizar TicketsDistribution
  try {
    if (ticketResult && ticketResult.ticketId) {
      const distributionCategories =
        ticketResult.boletas && ticketResult.boletas.length > 0
          ? ticketResult.boletas
          : baseCategories;

      // Solo regenerar distribuciones de categorías nuevas o con cantidadTickets cambiado
      const changedIds = new Set(ticketResult.changedCategoryIds || distributionCategories.map((c) => c.id));
      const categoriesToRegenerate = distributionCategories.filter((c) => changedIds.has(c.id));

      if (categoriesToRegenerate.length === 0) {
        console.log(`⏭️ Ninguna categoría (floors) cambió cantidad de tickets, omitiendo generateTicketsDistribution`);
      } else {
        console.log(
          `🚀 Generando TicketsDistribution (floors) para ${categoriesToRegenerate.length}/${distributionCategories.length} categorías, ticketId: ${ticketResult.ticketId}`,
        );
        // seatsMapping already built above; filter to only needed categories
        const filteredSeatsMapping = {};
        categoriesToRegenerate.forEach((c) => {
          filteredSeatsMapping[c.id] = seatsMapping[c.id] || [];
        });
        await generateTicketsDistribution(
          eventId,
          venueId,
          ticketResult.ticketId,
          categoriesToRegenerate,
          now,
          filteredSeatsMapping,
        );
        console.log(
          `✅ TicketsDistribution generadas (floors) para ticketId: ${ticketResult.ticketId}`,
        );
      }
      await applyPriceOnlyDistributionSync(
        eventId,
        venueId,
        ticketResult,
        distributionCategories,
        categoriesToRegenerate.map((c) => c.id),
      );
      await applyGateOnlyDistributionSync(
        eventId,
        venueId,
        ticketResult,
        distributionCategories,
        categoriesToRegenerate.map((c) => c.id),
      );
    }
  } catch (genErr) {
    console.error(
      "⚠️ Error generando TicketsDistribution desde floors:",
      genErr,
    );
  }

  return {
    ...ticketResult,
    categoriesProcessed: baseCategories.length,
    seatsProcessed: hasSeating
      ? Object.values(seatsMapping).reduce((sum, s) => sum + s.length, 0)
      : 0,
  };
}

/**
 * Construye un mapping categoryId -> lista de asientos con datos necesarios
 */
async function buildSeatsMappingForCategories(venueId, categoryIds) {
  const entries = await Promise.all(
    categoryIds.map(async (categoryId) => {
      const res = await dynamodb
        .query({
          TableName: TABLES.VENUE_SEAT(),
          IndexName: "categoryIdIndex",
          KeyConditionExpression: "categoryId = :categoryId",
          ExpressionAttributeValues: { ":categoryId": categoryId },
        })
        .promise();
      const seats = res.Items || [];
      // Ordenar de forma determinística por rowLabel y colNumber
      seats.sort((a, b) => {
        const ra = (a.rowLabel || "").toString();
        const rb = (b.rowLabel || "").toString();
        if (ra === rb) return (a.colNumber || 0) - (b.colNumber || 0);
        return ra.localeCompare(rb, undefined, { numeric: true });
      });
      return [
        categoryId,
        seats.map((s) => ({
          seatId: s.seatId,
          rowLabel: s.rowLabel || "",
          colNumber: s.colNumber || 0,
          seatLabel: s.seatLabel || `${s.rowLabel || ""}${s.colNumber || ""}`,
          floorId: s.floorId || null,
          venueId: venueId,
        })),
      ];
    }),
  );
  return Object.fromEntries(entries);
}

function resolveCategoryPurchasePrice(category) {
  const isPaid = category?.costo === true
    || category?.costo === "true"
    || category?.hasPrice === true
    || category?.hasPrice === "true";
  if (!isPaid) return 0;
  return Number(category?.valor || 0) || 0;
}

async function applyPriceOnlyDistributionSync(
  eventId,
  venueId,
  ticketResult,
  distributionCategories,
  regeneratedCategoryIds,
) {
  if (!ticketResult || !eventId || !venueId) return;

  const regeneratedIds = new Set(regeneratedCategoryIds || []);
  const priceOnlyUpdates = (distributionCategories || []).filter(
    (category) =>
      (ticketResult.priceChangedCategoryIds || []).includes(category.id) &&
      !regeneratedIds.has(category.id),
  );

  if (priceOnlyUpdates.length === 0) return;

  console.log(
    `💰 Sincronizando precios en ${priceOnlyUpdates.length} categorías sin regenerar distribución`,
  );
  await syncDistributionPricesForCategories(eventId, venueId, priceOnlyUpdates);
}

async function syncDistributionGatesForCategories(eventId, venueId, categories) {
  if (!categories?.length) return;

  for (const category of categories) {
    const categoryId = category.id;
    const nextGateId = category.gateId || null;
    let lastKey;

    do {
      const res = await dynamodb
        .query({
          TableName: TABLES.TICKETS_DIST(),
          IndexName: "eventIdIndex",
          KeyConditionExpression: "eventId = :eventId",
          FilterExpression: "venueId = :venueId AND boletaId = :boletaId",
          ExpressionAttributeValues: {
            ":eventId": eventId,
            ":venueId": venueId,
            ":boletaId": categoryId,
          },
          ExclusiveStartKey: lastKey,
        })
        .promise();

      for (const item of res.Items || []) {
        if ((item.gateId || null) === nextGateId) continue;
        await dynamodb
          .update({
            TableName: TABLES.TICKETS_DIST(),
            Key: { id: item.id, createDate: item.createDate },
            UpdateExpression: "SET gateId = :gateId",
            ExpressionAttributeValues: {
              ":gateId": nextGateId,
            },
          })
          .promise();
      }

      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
  }
}

async function applyGateOnlyDistributionSync(
  eventId,
  venueId,
  ticketResult,
  distributionCategories,
  regeneratedCategoryIds,
) {
  if (!ticketResult || !eventId || !venueId) return;

  const regeneratedIds = new Set(regeneratedCategoryIds || []);
  const gateOnlyUpdates = (distributionCategories || []).filter(
    (category) =>
      (ticketResult.gateChangedCategoryIds || []).includes(category.id) &&
      !regeneratedIds.has(category.id),
  );

  if (gateOnlyUpdates.length === 0) return;

  console.log(
    `🚪 Sincronizando puerta en ${gateOnlyUpdates.length} categorías sin regenerar distribución`,
  );
  await syncDistributionGatesForCategories(eventId, venueId, gateOnlyUpdates);
}

async function syncDistributionPricesForCategories(eventId, venueId, categories) {
  if (!categories?.length) return;

  for (const category of categories) {
    const categoryId = category.id;
    const purchasePrice = resolveCategoryPurchasePrice(category);
    let lastKey;

    do {
      const res = await dynamodb
        .query({
          TableName: TABLES.TICKETS_DIST(),
          IndexName: "eventIdIndex",
          KeyConditionExpression: "eventId = :eventId",
          FilterExpression: "venueId = :venueId AND boletaId = :boletaId",
          ExpressionAttributeValues: {
            ":eventId": eventId,
            ":venueId": venueId,
            ":boletaId": categoryId,
          },
          ExclusiveStartKey: lastKey,
        })
        .promise();

      for (const item of res.Items || []) {
        const tickets = item.tickets || [];
        let changed = false;
        const updatedTickets = tickets.map((ticket) => {
          if (ticket.ticketStatus !== "AVAILABLE") return ticket;
          if ((ticket.purchasePrice || 0) === purchasePrice) return ticket;
          changed = true;
          return { ...ticket, purchasePrice };
        });

        if (!changed) continue;

        await dynamodb
          .update({
            TableName: TABLES.TICKETS_DIST(),
            Key: { id: item.id, createDate: item.createDate },
            UpdateExpression: "SET tickets = :tickets",
            ExpressionAttributeValues: {
              ":tickets": updatedTickets,
            },
          })
          .promise();
      }

      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
  }
}

/**
 * Elimina distribuciones de TicketsDistribution para categorías removidas
 */
async function deleteDistributionsByCategoryIds(eventId, venueId, categoryIds) {
  if (!categoryIds || categoryIds.length === 0) return;

  console.log(
    `🗑️ Eliminando distribuciones de ${categoryIds.length} categorías removidas...`,
  );

  for (const categoryId of categoryIds) {
    let lastKey;
    do {
      const res = await dynamodb
        .query({
          TableName: TABLES.TICKETS_DIST(),
          IndexName: "eventIdIndex",
          KeyConditionExpression: "eventId = :eventId",
          FilterExpression: "venueId = :venueId AND boletaId = :boletaId",
          ExpressionAttributeValues: {
            ":eventId": eventId,
            ":venueId": venueId,
            ":boletaId": categoryId,
          },
          ExclusiveStartKey: lastKey,
        })
        .promise();

      const items = res.Items || [];
      if (items.length > 0) {
        const batchSize = 25;
        for (let i = 0; i < items.length; i += batchSize) {
          const batch = items.slice(i, i + batchSize);
          const deleteRequests = batch.map((item) => ({
            DeleteRequest: {
              Key: { id: item.id, createDate: item.createDate },
            },
          }));

          await dynamodb
            .batchWrite({
              RequestItems: {
                [TABLES.TICKETS_DIST()]: deleteRequests,
              },
            })
            .promise();
        }
      }

      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
  }
}

/**
 * Actualiza o crea el registro en la tabla Tickets
 */
async function updateTicketsTable(
  eventId,
  venueId,
  categories,
  hasSeating,
  now,
  body,
  eventSaleWindow,
) {
  console.log(
    `🎫 Actualizando tabla Tickets con ${categories.length} categorías`,
  );

  // Buscar si ya existe un registro de tickets para este evento
  const existingTickets = await dynamodb
    .query({
      TableName: TABLES.TICKETS(),
      IndexName: "eventIdIndex",
      KeyConditionExpression: "eventId = :eventId",
      ExpressionAttributeValues: {
        ":eventId": eventId,
      },
    })
    .promise();

  let ticketId;
  let action;

  if (existingTickets.Items && existingTickets.Items.length > 0) {
    // Actualizar registro existente
    const existingTicket = existingTickets.Items[0];
    ticketId = existingTicket.id;
    console.log(`📝 Actualizando registro existente de tickets: ${ticketId}`);

    const incomingIds = categories.map((c) => c.id);
    const removedCategoryIds = (existingTicket.boletas || [])
      .map((b) => b.id)
      .filter((id) => !incomingIds.includes(id));

    // Preservar distributionId/distributionCreateDate si no llegan en el payload
    const existingBoletasById = (existingTicket.boletas || []).reduce(
      (acc, b) => {
        acc[b.id] = b;
        return acc;
      },
      {},
    );

    const changedCategoryIds = [];
    const priceChangedCategoryIds = [];
    const gateChangedCategoryIds = [];
    const mergedBoletas = categories.map((b) => {
      const existing = existingBoletasById[b.id] || {};
      // Track categories that are new or whose cantidadTickets changed
      if (!existing.id || existing.cantidadTickets !== b.cantidadTickets) {
        changedCategoryIds.push(b.id);
      }
      const newPrice = resolveCategoryPurchasePrice(b);
      const oldPrice = existing.id ? resolveCategoryPurchasePrice(existing) : newPrice;
      const costoChanged = Boolean(existing.costo) !== Boolean(b.costo);
      if (existing.id && (newPrice !== oldPrice || costoChanged)) {
        priceChangedCategoryIds.push(b.id);
      }
      if (
        existing.id &&
        String(existing.gateId || "") !== String(b.gateId || "")
      ) {
        gateChangedCategoryIds.push(b.id);
      }
      return {
        ...b,
        distributionId: b.distributionId || existing.distributionId || uuidv4(),
        distributionCreateDate:
          b.distributionCreateDate || existing.distributionCreateDate || now,
      };
    });
    const saleWindow = resolveTicketSaleWindow({
      body,
      eventData: eventSaleWindow,
      fallbackStartDate: existingTicket.fechaIniVent || eventSaleWindow?.fechaIni || now,
      fallbackEndDate: existingTicket.fechaFinVent || eventSaleWindow?.fechaFin || now,
      fallbackStartTime: existingTicket.horaIniVent || "00:00",
      fallbackEndTime: existingTicket.horaFinVent || "23:59",
    });

    await dynamodb
      .update({
        TableName: TABLES.TICKETS(),
        Key: { id: ticketId },
        UpdateExpression:
          "SET boletas = :boletas, updatedAt = :updatedAt, hasSeating = :hasSeating, venueId = :venueId, fechaIniVent = :fechaIniVent, fechaFinVent = :fechaFinVent, horaIniVent = :horaIniVent, horaFinVent = :horaFinVent",
        ExpressionAttributeValues: {
          ":boletas": mergedBoletas,
          ":updatedAt": now,
          ":hasSeating": hasSeating,
          ":venueId": venueId,
          ":fechaIniVent": saleWindow.fechaIniVent,
          ":fechaFinVent": saleWindow.fechaFinVent,
          ":horaIniVent": saleWindow.horaIniVent,
          ":horaFinVent": saleWindow.horaFinVent,
        },
      })
      .promise();

    action = "updated";
    console.log(`✅ Tickets actualizados correctamente`);
    return {
      ticketId,
      action,
      categoriesCount: mergedBoletas.length,
      boletas: mergedBoletas,
      removedCategoryIds,
      changedCategoryIds,
      priceChangedCategoryIds,
      gateChangedCategoryIds,
    };
  } else {
    // Crear nuevo registro
    ticketId = uuidv4().substring(0, 10);
    console.log(`➕ Creando nuevo registro de tickets: ${ticketId}`);
    const saleWindow = resolveTicketSaleWindow({
      body,
      eventData: eventSaleWindow,
      fallbackStartDate: eventSaleWindow?.fechaIni || now,
      fallbackEndDate: eventSaleWindow?.fechaFin || now,
    });

    const ticketRecord = {
      id: ticketId,
      eventId: eventId,
      venueId: venueId,
      boletas: categories,
      fechaIniVent: saleWindow.fechaIniVent,
      fechaFinVent: saleWindow.fechaFinVent,
      horaIniVent: saleWindow.horaIniVent,
      horaFinVent: saleWindow.horaFinVent,
      createDate: now,
      hasSeating: hasSeating,
    };

    await dynamodb
      .put({
        TableName: TABLES.TICKETS(),
        Item: ticketRecord,
      })
      .promise();

    action = "created";
    console.log(`✅ Tickets creados correctamente`);
    return {
      ticketId,
      action,
      categoriesCount: categories.length,
      boletas: categories,
      removedCategoryIds: [],
      changedCategoryIds: categories.map((c) => c.id),
    };
  }
}

async function syncTicketSalesWindowFields(eventId, body, now, eventSaleWindow) {
  const existingTickets = await dynamodb
    .query({
      TableName: TABLES.TICKETS(),
      IndexName: "eventIdIndex",
      KeyConditionExpression: "eventId = :eventId",
      ExpressionAttributeValues: {
        ":eventId": eventId,
      },
    })
    .promise();

  if (!existingTickets.Items || existingTickets.Items.length === 0) {
    return;
  }

  const existingTicket = existingTickets.Items[0];
  const saleWindow = resolveTicketSaleWindow({
    body,
    eventData: eventSaleWindow,
    fallbackStartDate: existingTicket.fechaIniVent || eventSaleWindow?.fechaIni || now,
    fallbackEndDate: existingTicket.fechaFinVent || eventSaleWindow?.fechaFin || now,
    fallbackStartTime: existingTicket.horaIniVent || "00:00",
    fallbackEndTime: existingTicket.horaFinVent || "23:59",
  });
  await dynamodb
    .update({
      TableName: TABLES.TICKETS(),
      Key: { id: existingTicket.id },
      UpdateExpression:
        "SET updatedAt = :updatedAt, fechaIniVent = :fechaIniVent, fechaFinVent = :fechaFinVent, horaIniVent = :horaIniVent, horaFinVent = :horaFinVent",
      ExpressionAttributeValues: {
        ":updatedAt": now,
        ":fechaIniVent": saleWindow.fechaIniVent,
        ":fechaFinVent": saleWindow.fechaFinVent,
        ":horaIniVent": saleWindow.horaIniVent,
        ":horaFinVent": saleWindow.horaFinVent,
      },
    })
    .promise();
}

/**
 * Procesa eliminaciones en batch
 * Formato esperado en body.deletions:
 * {
 *   floors: ["floorId1", "floorId2"],
 *   categories: ["categoryId1", "categoryId2"],
 *   seats: ["seatId1", "seatId2"],
 *   elements: ["elementId1", "elementId2"]
 * }
 */
async function processBatchDeletions(venueId, deletions, eventId) {
  const results = {
    floors: 0,
    categories: 0,
    seats: 0,
    elements: 0,
  };

  if (!deletions || Object.keys(deletions).length === 0) {
    console.log("⚠️ No hay eliminaciones para procesar");
    return results;
  }

  console.log("🗑️ Procesando eliminaciones en batch...");

  // Eliminar floors
  if (
    deletions.floors &&
    Array.isArray(deletions.floors) &&
    deletions.floors.length > 0
  ) {
    console.log(`🗑️ Eliminando ${deletions.floors.length} floors...`);
    for (const floorId of deletions.floors) {
      await deleteFloor(floorId, venueId);
      results.floors++;
    }
  }

  // Eliminar categorías
  if (
    deletions.categories &&
    Array.isArray(deletions.categories) &&
    deletions.categories.length > 0
  ) {
    console.log(`🗑️ Eliminando ${deletions.categories.length} categorías...`);

    const batchSize = 25;
    for (let i = 0; i < deletions.categories.length; i += batchSize) {
      const batch = deletions.categories.slice(i, i + batchSize);

      const deleteRequests = batch.map((categoryId) => ({
        DeleteRequest: {
          Key: { categoryId },
        },
      }));

      await dynamodb
        .batchWrite({
          RequestItems: {
            [TABLES.VENUE_CATEGORY()]: deleteRequests,
          },
        })
        .promise();

      results.categories += batch.length;
    }
    console.log(`✅ ${deletions.categories.length} categorías eliminadas`);
  }

  // Eliminar seats
  if (
    deletions.seats &&
    Array.isArray(deletions.seats) &&
    deletions.seats.length > 0
  ) {
    console.log(`🗑️ Eliminando ${deletions.seats.length} asientos...`);

    const batchSize = 25;
    for (let i = 0; i < deletions.seats.length; i += batchSize) {
      const batch = deletions.seats.slice(i, i + batchSize);

      const deleteRequests = batch.map((seatId) => ({
        DeleteRequest: {
          Key: { seatId },
        },
      }));

      await dynamodb
        .batchWrite({
          RequestItems: {
            [TABLES.VENUE_SEAT()]: deleteRequests,
          },
        })
        .promise();

      results.seats += batch.length;
    }
    console.log(`✅ ${deletions.seats.length} asientos eliminados`);
  }

  // Eliminar elements
  if (
    deletions.elements &&
    Array.isArray(deletions.elements) &&
    deletions.elements.length > 0
  ) {
    console.log(`🗑️ Eliminando ${deletions.elements.length} elementos...`);

    const batchSize = 25;
    for (let i = 0; i < deletions.elements.length; i += batchSize) {
      const batch = deletions.elements.slice(i, i + batchSize);

      const deleteRequests = batch.map((elementId) => ({
        DeleteRequest: {
          Key: { elementId },
        },
      }));

      await dynamodb
        .batchWrite({
          RequestItems: {
            [TABLES.VENUE_ELEMENT()]: deleteRequests,
          },
        })
        .promise();

      results.elements += batch.length;
    }
    console.log(`✅ ${deletions.elements.length} elementos eliminados`);
  }

  return results;
}

/**
 * Elimina un floor y todos sus elementos relacionados (categorías, seats, elements)
 */
async function deleteFloor(floorId, venueId) {
  console.log(`🗑️ Eliminando floor ${floorId} y sus elementos relacionados...`);

  // Eliminar categorías del floor
  const categories = await dynamodb
    .query({
      TableName: TABLES.VENUE_CATEGORY(),
      IndexName: "floorIdIndex",
      KeyConditionExpression: "floorId = :floorId",
      ExpressionAttributeValues: {
        ":floorId": floorId,
      },
    })
    .promise();

  if (categories.Items && categories.Items.length > 0) {
    // Eliminar seats de cada categoría
    for (const category of categories.Items) {
      await deleteCategorySeats(category.categoryId);
    }

    // Eliminar categorías en batch
    const batchSize = 25;
    for (let i = 0; i < categories.Items.length; i += batchSize) {
      const batch = categories.Items.slice(i, i + batchSize);
      const deleteRequests = batch.map((cat) => ({
        DeleteRequest: {
          Key: { categoryId: cat.categoryId },
        },
      }));

      await dynamodb
        .batchWrite({
          RequestItems: {
            [TABLES.VENUE_CATEGORY()]: deleteRequests,
          },
        })
        .promise();
    }
  }

  // Eliminar elementos del floor
  const elements = await dynamodb
    .query({
      TableName: TABLES.VENUE_ELEMENT(),
      IndexName: "floorIdIndex",
      KeyConditionExpression: "floorId = :floorId",
      ExpressionAttributeValues: {
        ":floorId": floorId,
      },
    })
    .promise();

  if (elements.Items && elements.Items.length > 0) {
    const batchSize = 25;
    for (let i = 0; i < elements.Items.length; i += batchSize) {
      const batch = elements.Items.slice(i, i + batchSize);
      const deleteRequests = batch.map((elem) => ({
        DeleteRequest: {
          Key: { elementId: elem.elementId },
        },
      }));

      await dynamodb
        .batchWrite({
          RequestItems: {
            [TABLES.VENUE_ELEMENT()]: deleteRequests,
          },
        })
        .promise();
    }
  }

  // Eliminar el floor
  await dynamodb
    .delete({
      TableName: TABLES.VENUE_FLOOR(),
      Key: { floorId },
    })
    .promise();

  console.log(`✅ Floor ${floorId} eliminado completamente`);
}

/**
 * Elimina todos los seats de una categoría
 */
async function deleteCategorySeats(categoryId) {
  const seats = await dynamodb
    .query({
      TableName: TABLES.VENUE_SEAT(),
      IndexName: "categoryIdIndex",
      KeyConditionExpression: "categoryId = :categoryId",
      ExpressionAttributeValues: {
        ":categoryId": categoryId,
      },
    })
    .promise();

  if (seats.Items && seats.Items.length > 0) {
    const batchSize = 25;
    for (let i = 0; i < seats.Items.length; i += batchSize) {
      const batch = seats.Items.slice(i, i + batchSize);
      const deleteRequests = batch.map((seat) => ({
        DeleteRequest: {
          Key: { seatId: seat.seatId },
        },
      }));

      await dynamodb
        .batchWrite({
          RequestItems: {
            [TABLES.VENUE_SEAT()]: deleteRequests,
          },
        })
        .promise();
    }
  }
}

/**
 * Procesa imágenes en base64 y las sube a S3
 * Soporta tanto imagen única (imageBase64) como array de imágenes (images)
 * @returns Array de URLs de las imágenes subidas
 */
async function processBase64Images(venueId, body, existingVenue, now) {
  const uploadedImageUrls = [];
  const imagesToProcess = [];

  // Si viene un array de imágenes con base64
  if (body.images && Array.isArray(body.images)) {
    console.log(`📸 Detectadas ${body.images.length} imágenes en array`);
    for (const img of body.images) {
      if (img.base64 && img.fileName) {
        imagesToProcess.push(img);
      }
    }
  }

  // Si viene una imagen única (imageBase64)
  if (body.imageBase64) {
    console.log("📸 Detectada imagen única en imageBase64");
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
      fileName: `venue-image-${Date.now()}.${fileExtension}`,
    });
  }

  if (imagesToProcess.length === 0) {
    console.log("⚠️ No se encontraron imágenes en base64 para procesar");
    return uploadedImageUrls;
  }

  console.log(`🔄 Procesando ${imagesToProcess.length} imágenes...`);

  for (const imageData of imagesToProcess) {
    if (imageData.base64 && imageData.fileName) {
      try {
        // Generar ID único para la imagen
        const imageId = uuidv4();
        const fileExtension = imageData.fileName.split(".").pop().toLowerCase();
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
              action: "venue-update",
            },
          })
          .promise();

        // Construir URL pública
        const imageUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${s3Key}`;
        uploadedImageUrls.push(imageUrl);

        console.log(`✅ Imagen subida: ${imageUrl}`);
      } catch (imageError) {
        console.error("❌ Error al subir imagen:", imageError);
        // Continuar con las demás imágenes
      }
    }
  }

  console.log(`✅ Total de imágenes subidas: ${uploadedImageUrls.length}`);
  return uploadedImageUrls;
}
