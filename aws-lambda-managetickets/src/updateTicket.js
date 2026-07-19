const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const { v4 } = require("uuid");
const lambda = new AWS.Lambda();

const EVENT_LIFECYCLE_SCHEDULER_UPSERT_FUNCTION =
  process.env.EVENT_LIFECYCLE_SCHEDULER_UPSERT_FUNCTION ||
  "events-lifecycle-manager-scheduler-upsert";

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
      `[updateTicket] No se pudo reconciliar lifecycle scheduler para eventId=${eventId}: ${error.message}`
    );
  }
};

const normalizeSaleDate = (dateValue) => {
  if (dateValue === undefined || dateValue === null) {
    return undefined;
  }

  const normalized = String(dateValue).trim();
  if (!normalized) {
    return null;
  }

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

  return null;
};

const normalizeSaleTime = (timeValue) => {
  if (timeValue === undefined || timeValue === null) {
    return undefined;
  }

  const normalized = String(timeValue).trim();
  return normalized || null;
};

exports.updateTicket = async (event) => {
  console.log("Iniciando la función updateTicket.");
  let response;
  const Bucket = "lambdaboletasbucket";
  let isCreatingNew = false;

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "El cuerpo de la solicitud está vacío",
        }),
      };
    }

    const {
      ticketId,
      eventId,
      boletas,
      fechaIniVent: rawFechaIniVent,
      fechaFinVent: rawFechaFinVent,
      horaIniVent: rawHoraIniVent,
      horaFinVent: rawHoraFinVent,
    } = JSON.parse(event.body);

    const fechaIniVent = normalizeSaleDate(rawFechaIniVent);
    const fechaFinVent = normalizeSaleDate(rawFechaFinVent);
    const horaIniVent = normalizeSaleTime(rawHoraIniVent);
    const horaFinVent = normalizeSaleTime(rawHoraFinVent);

    if (!ticketId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "El ticketId es obligatorio" }),
      };
    }

    if (!eventId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "El eventId es obligatorio" }),
      };
    }

    console.log(`[1/8] Verificando si existe el evento ${eventId}...`);
    const eventParams = { TableName: process.env.EVENTS_TABLE || "Eventos", Key: { id: eventId } };
    const eventResult = await dynamodb.get(eventParams).promise();

    if (!eventResult.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: "El evento especificado no existe",
        }),
      };
    }

    console.log(`[2/8] Obteniendo ticket con ID: ${ticketId}`);
    const ticketParams = { TableName: process.env.TICKETS_TABLE || "Tickets", Key: { id: ticketId } };
    const ticketResult = await dynamodb.get(ticketParams).promise();

    let boletasAntes = [];
    let boletasAntesMap = new Map();

    // ✅ VERIFICAR SI EL TICKET EXISTE O CREAR UNO NUEVO
    if (!ticketResult.Item) {
      console.log(
        "[3/8] Ticket no existe. Verificando si el eventId ya tiene tickets..."
      );

      // Verificar si el evento ya tiene tickets creados
      const eventoUsadoParams = {
        TableName: process.env.TICKETS_TABLE || "Tickets",
        IndexName: "eventIdIndex",
        KeyConditionExpression: "eventId = :eventId",
        ExpressionAttributeValues: {
          ":eventId": eventId,
        },
      };

      const resultadoestado = await dynamodb.query(eventoUsadoParams).promise();

      if (resultadoestado.Items.length > 0) {
        return {
          statusCode: 409,
          body: JSON.stringify({
            success: false,
            message: "El evento ya tiene tickets creados con otro ID",
          }),
        };
      }

      console.log("[3/8] Creando ticket nuevo...");
      isCreatingNew = true;
      boletasAntes = [];
      boletasAntesMap = new Map();
    } else {
      console.log("[3/8] Ticket existente encontrado.");
      boletasAntes = ticketResult.Item.boleta || [];
      boletasAntesMap = new Map(boletasAntes.map((b) => [b.id, b]));
    }

    console.log("[4/8] Procesando boletas e imágenes en S3...");
    const createDate = new Date().toISOString();

    // ✅ NUEVA LÓGICA: Generar o mantener distributionId para cada boleta
    const boletasWithDistribution = boletas.map((boleta) => {
      const boletaExistente = boletasAntesMap.get(boleta.id);

      // Si la boleta ya existe y tiene distributionId, mantenerlo; sino crear uno nuevo
      const distributionId = boletaExistente?.distributionId || v4();
      const distributionCreateDate =
        boletaExistente?.distributionCreateDate || createDate;

      return {
        ...boleta,
        distributionId: distributionId,
        distributionCreateDate: distributionCreateDate,
      };
    });

    const boletasDespues = await Promise.all(
      boletasWithDistribution.map(async (boleta) => {
        const { id, imagenB64, cantidadTickets } = boleta;
        const boletaEncontrada = boletasAntesMap.get(id);
        let imagenboleta;

        if (imagenB64 && imagenB64.trim() !== "") {
          const key =
            boletaEncontrada?.imgboleta || `${ticketId}${id}${eventId}`;
          const bodyBuffer = Buffer.from(imagenB64, "base64");
          await s3
            .upload({
              Bucket,
              Key: key,
              Body: bodyBuffer,
              ContentEncoding: "base64",
              ContentType: "image/jpeg",
            })
            .promise();
          imagenboleta = key;
        } else if (imagenB64 === "" && boletaEncontrada?.imgboleta) {
          await s3
            .deleteObject({ Bucket, Key: boletaEncontrada.imgboleta })
            .promise();
          imagenboleta = "";
        } else {
          imagenboleta = boletaEncontrada?.imgboleta;
        }

        const boletaActualizada = { ...boleta };
        delete boletaActualizada.imagenB64;

        // Normalizar el campo 'Valor' a 'valor'
        if (boletaActualizada.Valor !== undefined) {
          boletaActualizada.valor = boletaActualizada.Valor;
          delete boletaActualizada.Valor;
        }

        const finalBoletaData = {
          ...boletaEncontrada,
          ...boletaActualizada,
          imgboleta: imagenboleta,
          // ✅ AGREGAR CAMPOS DE DISTRIBUCIÓN A CADA BOLETA
          distributionId: boleta.distributionId,
          distributionCreateDate: boleta.distributionCreateDate, // ✅ USAR distributionCreateDate
        };

        if (cantidadTickets !== undefined) {
          const sold = finalBoletaData.soldTickets || 0;
          const reserved = finalBoletaData.reservedTickets || 0;
          finalBoletaData.avaliableCapacity = cantidadTickets - sold - reserved;
        }

        if (!boletaEncontrada) {
          finalBoletaData.reservedTickets = 0;
          finalBoletaData.soldTickets = 0;
        }

        return finalBoletaData;
      })
    );
    console.log("[5/8] Boletas e imágenes procesadas.");

    // ✅ CREAR O ACTUALIZAR EL TICKET
    if (isCreatingNew) {
      console.log("[6/8] Creando nuevo registro en la tabla Tickets...");
      const ticketCreateParams = {
        TableName: process.env.TICKETS_TABLE || "Tickets",
        Item: {
          id: ticketId,
          eventId,
          boleta: boletasDespues,
          fechaIniVent: fechaIniVent === undefined ? null : fechaIniVent,
          fechaFinVent: fechaFinVent === undefined ? null : fechaFinVent,
          horaIniVent: horaIniVent === undefined ? null : horaIniVent,
          horaFinVent: horaFinVent === undefined ? null : horaFinVent,
          createDate,
        },
      };
      await dynamodb.put(ticketCreateParams).promise();
    } else {
      console.log(
        "[6/8] Actualizando registro existente en la tabla Tickets..."
      );
      const ticketUpdateParams = {
        TableName: process.env.TICKETS_TABLE || "Tickets",
        Key: { id: ticketId },
        UpdateExpression: "SET #boleta = :boleta",
        ExpressionAttributeNames: { "#boleta": "boleta" },
        ExpressionAttributeValues: { ":boleta": boletasDespues },
      };

      if (fechaIniVent !== undefined) {
        ticketUpdateParams.UpdateExpression += ", #fechaIniVent = :fechaIniVent";
        ticketUpdateParams.ExpressionAttributeNames["#fechaIniVent"] =
          "fechaIniVent";
        ticketUpdateParams.ExpressionAttributeValues[":fechaIniVent"] =
          fechaIniVent;
      }
      if (fechaFinVent !== undefined) {
        ticketUpdateParams.UpdateExpression += ", #fechaFinVent = :fechaFinVent";
        ticketUpdateParams.ExpressionAttributeNames["#fechaFinVent"] =
          "fechaFinVent";
        ticketUpdateParams.ExpressionAttributeValues[":fechaFinVent"] =
          fechaFinVent;
      }
      if (horaIniVent !== undefined) {
        ticketUpdateParams.UpdateExpression += ", #horaIniVent = :horaIniVent";
        ticketUpdateParams.ExpressionAttributeNames["#horaIniVent"] =
          "horaIniVent";
        ticketUpdateParams.ExpressionAttributeValues[":horaIniVent"] =
          horaIniVent;
      }
      if (horaFinVent !== undefined) {
        ticketUpdateParams.UpdateExpression += ", #horaFinVent = :horaFinVent";
        ticketUpdateParams.ExpressionAttributeNames["#horaFinVent"] =
          "horaFinVent";
        ticketUpdateParams.ExpressionAttributeValues[":horaFinVent"] =
          horaFinVent;
      }

      // Verificar tamaño antes de actualizar
      const objectString = JSON.stringify(boletasDespues);
      const sizeInBytes = new TextEncoder().encode(objectString).length;
      const sizeInKilobytes = sizeInBytes / 1024;
      console.log(
        `Tamaño estimado del array 'boletasDespues': ${sizeInKilobytes.toFixed(
          2
        )} KB`
      );

      if (sizeInKilobytes > 380) {
        console.error(
          "ERROR: El tamaño del objeto 'boletas' es demasiado grande para DynamoDB."
        );
        return {
          statusCode: 400,
          body: JSON.stringify({
            success: false,
            message: `El tamaño de los datos de las boletas (${sizeInKilobytes.toFixed(
              2
            )} KB) excede el límite de DynamoDB.`,
          }),
        };
      }

      await dynamodb.update(ticketUpdateParams).promise();
    }

    console.log("[7/8] Registro principal completado.");

    // ✅ SINCRONIZACIÓN DE TICKETSDISTRIBUTION - SEPARAR ELIMINACIONES Y CREACIONES
    console.log(
      `[8/8] Sincronizando TicketsDistribution para el evento ${eventId}...`
    );

    // ✅ PASO 1: ELIMINAR REGISTROS EXISTENTES PRIMERO
    if (!isCreatingNew && boletasAntes.length > 0) {
      console.log("PASO 1: Eliminando registros de distribución existentes...");

      const deleteOperations = [];
      for (const boletaAnterior of boletasAntes) {
        if (
          boletaAnterior.distributionId &&
          boletaAnterior.distributionCreateDate
        ) {
          deleteOperations.push({
            DeleteRequest: {
              Key: {
                id: boletaAnterior.distributionId,
                createDate: boletaAnterior.distributionCreateDate,
              },
            },
          });
          console.log(
            `Programado para eliminar: id=${boletaAnterior.distributionId}, createDate=${boletaAnterior.distributionCreateDate}`
          );
        }
      }

      // Ejecutar solo eliminaciones
      if (deleteOperations.length > 0) {
        console.log(
          `Ejecutando ${deleteOperations.length} operaciones de eliminación...`
        );
        const chunkSize = 25;
        for (let i = 0; i < deleteOperations.length; i += chunkSize) {
          const chunk = deleteOperations.slice(i, i + chunkSize);
          try {
            console.log(
              `Eliminando chunk ${Math.floor(i / chunkSize) + 1} con ${
                chunk.length
              } operaciones...`
            );

            const batchResult = await dynamodb
              .batchWrite({ RequestItems: { TicketsDistribution: chunk } })
              .promise();

            if (
              batchResult.UnprocessedItems &&
              Object.keys(batchResult.UnprocessedItems).length > 0
            ) {
              console.log("Reintentando eliminaciones no procesadas...");
              await dynamodb
                .batchWrite({ RequestItems: batchResult.UnprocessedItems })
                .promise();
            }
          } catch (batchError) {
            console.error("Error en eliminaciones batchWrite:", batchError);
            throw new Error(
              `Error eliminando TicketsDistribution: ${batchError.message}`
            );
          }
        }
        console.log("Eliminaciones completadas.");
      }
    }

    // ✅ PASO 2: CREAR NUEVOS REGISTROS DESPUÉS
    console.log("PASO 2: Creando nuevos registros de distribución...");

    const createOperations = [];
    for (const boleta of boletasDespues) {
      const ticketsArray = [];
      if (boleta.cantidadTickets > 0) {
        for (let i = 0; i < boleta.cantidadTickets; i++) {
          ticketsArray.push({
            ticketInstanceId: v4(),
            category: boleta.categoria,
            ticketStatus: "AVAILABLE",
            qrCodeKey: v4(),
            ownerId: null,
            entityType: "TICKET",
            purchasePrice: boleta.valor,
            orderId: null,
            distributionId: boleta.distributionId,
            createDate: boleta.distributionCreateDate,
          });
        }
      }

      createOperations.push({
        PutRequest: {
          Item: {
            id: boleta.distributionId,
            createDate: boleta.distributionCreateDate,
            ticketId,
            eventId,
            boletaId: boleta.id,
            tickets: ticketsArray,
          },
        },
      });
      console.log(
        `Programado para crear: id=${boleta.distributionId}, createDate=${boleta.distributionCreateDate}`
      );
    }

    // Ejecutar solo creaciones
    if (createOperations.length > 0) {
      console.log(
        `Ejecutando ${createOperations.length} operaciones de creación...`
      );
      const chunkSize = 25;
      for (let i = 0; i < createOperations.length; i += chunkSize) {
        const chunk = createOperations.slice(i, i + chunkSize);
        try {
          console.log(
            `Creando chunk ${Math.floor(i / chunkSize) + 1} con ${
              chunk.length
            } operaciones...`
          );

          const batchResult = await dynamodb
            .batchWrite({ RequestItems: { TicketsDistribution: chunk } })
            .promise();

          if (
            batchResult.UnprocessedItems &&
            Object.keys(batchResult.UnprocessedItems).length > 0
          ) {
            console.log("Reintentando creaciones no procesadas...");
            await dynamodb
              .batchWrite({ RequestItems: batchResult.UnprocessedItems })
              .promise();
          }
        } catch (batchError) {
          console.error("Error en creaciones batchWrite:", batchError);
          throw new Error(
            `Error creando TicketsDistribution: ${batchError.message}`
          );
        }
      }
      console.log("Creaciones completadas.");
    }

    console.log("Sincronización de TicketsDistribution completada.");
    await notifyLifecycleScheduler(eventId);

    response = {
      statusCode: isCreatingNew ? 201 : 200,
      body: JSON.stringify({
        success: true,
        message: isCreatingNew
          ? "Ticket creado y distribuido exitosamente"
          : "Ticket actualizado y sincronizado exitosamente",
        data: {
          id: ticketId,
          eventId,
          boleta: boletasDespues,
          isNew: isCreatingNew,
        },
      }),
    };
  } catch (error) {
    console.error("Error al actualizar/crear el ticket:", error);
    response = {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error interno del servidor",
        error: error.message,
      }),
    };
  }
  console.log("Función finalizada.");
  return response;
};
