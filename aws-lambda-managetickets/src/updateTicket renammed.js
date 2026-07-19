const { v4 } = require("uuid");
const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const convertDateToComparable = (dateStr) => {
  if (!dateStr || !/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    return null;
  }
  const [day, month, year] = dateStr.split("/");
  return `${year}${month}${day}`;
};

exports.updateTicket = async (event) => {
  let response;
  const Bucket = "lambdaboletasbucket";
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "El cuerpo de la solicitud está vacío",
        }),
      };
    }

    const {
      ticketId,
      eventId,
      boletas,
      fechaIniVent,
      fechaFinVent,
      horaIniVent,
      horaFinVent,
    } = JSON.parse(event.body);

    if (!ticketId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "El ticketId es obligatorio" }),
      };
    }

    const ticketParams = { TableName: process.env.TICKETS_TABLE || "Tickets", Key: { id: ticketId } };
    const ticketResult = await dynamodb.get(ticketParams).promise();

    if (!ticketResult.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: "El ticket no existe",
        }),
      };
    }

    const boletasAntes = ticketResult.Item.boleta || [];

    // --- Lógica para procesar boletas y sus imágenes ---
    const boletasDespues = await Promise.all(
      boletas.map(async (boleta) => {
        const { id, imagenB64, cantidadTickets } = boleta;
        const boletaEncontrada = boletasAntes.find((b) => b.id === id);
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

        const finalBoletaData = {
          ...boletaEncontrada,
          ...boleta,
          imgboleta: imagenboleta,
        };

        if (cantidadTickets !== undefined) {
          finalBoletaData.avaliableCapacity =
            cantidadTickets -
            (finalBoletaData.soldTickets || 0) -
            (finalBoletaData.reservedTickets || 0);
        }

        if (!boletaEncontrada) {
          finalBoletaData.reservedTickets = 0;
          finalBoletaData.soldTickets = 0;
        }

        return finalBoletaData;
      })
    );

    // --- Lógica para actualizar la tabla Tickets ---
    const updateExpressions = ["#boleta = :boleta"];
    const expressionAttributeNames = { "#boleta": "boleta" };
    const expressionAttributeValues = { ":boleta": boletasDespues };

    if (fechaIniVent) {
      updateExpressions.push("#fechaIniVent = :fechaIniVent");
      expressionAttributeNames["#fechaIniVent"] = "fechaIniVent";
      expressionAttributeValues[":fechaIniVent"] = fechaIniVent;
      const fechaIniVentComparable = convertDateToComparable(fechaIniVent);
      if (fechaIniVentComparable) {
        updateExpressions.push(
          "#fechaIniVentComparable = :fechaIniVentComparable"
        );
        expressionAttributeNames["#fechaIniVentComparable"] =
          "fechaIniVentComparable";
        expressionAttributeValues[":fechaIniVentComparable"] =
          fechaIniVentComparable;
      }
    }

    if (fechaFinVent) {
      updateExpressions.push("#fechaFinVent = :fechaFinVent");
      expressionAttributeNames["#fechaFinVent"] = "fechaFinVent";
      expressionAttributeValues[":fechaFinVent"] = fechaFinVent;
      const fechaFinVentComparable = convertDateToComparable(fechaFinVent);
      if (fechaFinVentComparable) {
        updateExpressions.push(
          "#fechaFinVentComparable = :fechaFinVentComparable"
        );
        expressionAttributeNames["#fechaFinVentComparable"] =
          "fechaFinVentComparable";
        expressionAttributeValues[":fechaFinVentComparable"] =
          fechaFinVentComparable;
      }
    }

    if (horaIniVent) {
      updateExpressions.push("#horaIniVent = :horaIniVent");
      expressionAttributeNames["#horaIniVent"] = "horaIniVent";
      expressionAttributeValues[":horaIniVent"] = horaIniVent;
    }

    if (horaFinVent) {
      updateExpressions.push("#horaFinVent = :horaFinVent");
      expressionAttributeNames["#horaFinVent"] = "horaFinVent";
      expressionAttributeValues[":horaFinVent"] = horaFinVent;
    }

    const ticketUpdateParams = {
      TableName: process.env.TICKETS_TABLE || "Tickets",
      Key: { id: ticketId },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    };

    await dynamodb.update(ticketUpdateParams).promise();

    // --- INICIO: Lógica para sincronizar ticketsDistribution ---
    const distributionUpdates = [];
    const boletasAntesMap = new Map(boletasAntes.map((b) => [b.id, b]));
    const boletasDespuesMap = new Map(boletasDespues.map((b) => [b.id, b]));

    // Consultar los registros de distribución existentes para este evento
    const distParams = {
      TableName: process.env.TICKETS_DIST_TABLE || "TicketsDistribution",
      IndexName: "eventIdIndex", // Asume que tienes un GSI con eventId
      KeyConditionExpression: "eventId = :eventId",
      ExpressionAttributeValues: { ":eventId": eventId },
    };
    const distResult = await dynamodb.query(distParams).promise();
    const distMap = new Map(
      distResult.Items.map((item) => [item.boletaId, item])
    );

    for (const [boletaId, boletaDespues] of boletasDespuesMap.entries()) {
      const boletaAntes = boletasAntesMap.get(boletaId);
      const distDoc = distMap.get(boletaId);

      if (!boletaAntes) {
        // Boleta nueva
        const ticketsArray = [];
        for (let i = 0; i < boletaDespues.cantidadTickets; i++) {
          ticketsArray.push({
            ticketInstanceId: v4(),
            status: "AVAILABLE",
            qrCode: v4(),
            ownerId: null,
          });
        }
        distributionUpdates.push({
          PutRequest: {
            Item: {
              id: v4(),
              ticketId,
              eventId,
              boletaId,
              tickets: ticketsArray,
              createDate: new Date().toISOString(),
            },
          },
        });
      } else if (
        boletaDespues.cantidadTickets !== boletaAntes.cantidadTickets
      ) {
        // Cantidad modificada
        if (distDoc) {
          const diff =
            boletaDespues.cantidadTickets - boletaAntes.cantidadTickets;
          if (diff > 0) {
            // Añadir tickets
            for (let i = 0; i < diff; i++) {
              distDoc.tickets.push({
                ticketInstanceId: v4(),
                category: boleta.categoria,
                location: {},
                ticketStatus: "AVAILABLE",
                qrCodeKey: v4(),
                ownerId: null,
                entityType: "TICKET",
                purchasePrice: boleta.costo,
                orderId: null,
              });
            }
          } else {
            // Quitar tickets
            const availableTickets = distDoc.tickets.filter(
              (t) => t.status === "AVAILABLE"
            );
            if (availableTickets.length < Math.abs(diff)) {
              throw new Error(
                `No se pueden reducir ${Math.abs(
                  diff
                )} tickets para la categoría ${
                  boletaDespues.categoria
                }. Solo hay ${availableTickets.length} disponibles.`
              );
            }
            const ticketsToRemove = new Set(
              availableTickets
                .slice(0, Math.abs(diff))
                .map((t) => t.ticketInstanceId)
            );
            distDoc.tickets = distDoc.tickets.filter(
              (t) => !ticketsToRemove.has(t.ticketInstanceId)
            );
          }
          distributionUpdates.push({ PutRequest: { Item: distDoc } });
        }
      }
    }

    // Lógica para boletas eliminadas
    for (const [boletaId, boletaAntes] of boletasAntesMap.entries()) {
      if (!boletasDespuesMap.has(boletaId)) {
        const distDoc = distMap.get(boletaId);
        if (distDoc) {
          distributionUpdates.push({
            DeleteRequest: { Key: { id: distDoc.id } },
          });
        }
      }
    }

    if (distributionUpdates.length > 0) {
      const chunkSize = 25;
      for (let i = 0; i < distributionUpdates.length; i += chunkSize) {
        const chunk = distributionUpdates.slice(i, i + chunkSize);
        await dynamodb
          .batchWrite({ RequestItems: { TicketsDistribution: chunk } })
          .promise();
      }
    }
    // --- FIN: Lógica de sincronización ---

    response = {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Ticket actualizado y sincronizado exitosamente",
      }),
    };
  } catch (error) {
    console.error("Error al actualizar el ticket:", error);
    response = {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error interno del servidor",
        error: error.message,
      }),
    };
  }
  return response;
};
