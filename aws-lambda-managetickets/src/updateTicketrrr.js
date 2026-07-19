const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

exports.updateTicket = async (event) => {
  let response;
  let ticketResult;
  const Bucket = "lambdaboletasbucket";
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
      fechaIniVent,
      fechaFinVent,
      horaIniVent,
      horaFinVent,
    } = JSON.parse(event.body);

    // Validación inicial: El `ticketId` es obligatorio solo para actualizar el ticket
    if (
      ticketId &&
      !eventId &&
      !boletas &&
      !fechaIniVent &&
      !fechaFinVent &&
      !horaIniVent &&
      !horaFinVent
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message:
            "Se debe proporcionar al menos un dato para actualizar el ticket",
        }),
      };
    }

    // Actualizar el ticket si se proporciona `ticketId`
    if (ticketId) {
      const ticketParams = {
        TableName: process.env.TICKETS_TABLE || "Tickets",
        Key: { id: ticketId },
      };

      ticketResult = await dynamodb.get(ticketParams).promise();

      // Si el ticket no existe, devolver error
      if (!ticketResult.Item) {
        return {
          statusCode: 404,
          body: JSON.stringify({
            success: false,
            message: "El ticket no existe",
          }),
        };
      }
      const IdTickets = boletas.map((b) => {
        const id = b.id;
        return { id: id };
      });
      const boletasNoEncontradas = ticketResult.Item.boleta.filter(
        (b) => !IdTickets.some((ticket) => ticket.id === b.id)
      );
      if (boletasNoEncontradas.length > 0) {
        await boletasNoEncontradas.map(async (boleta) => {
          const params = {
            Bucket: Bucket,
            Key: boleta.imgboleta,
          };

          try {
            await s3.deleteObject(params).promise();
          } catch (error) {
            throw new Error(
              `Error al eliminar la imagen con key ${boleta.imgboleta}:`,
              error
            );
          }
        });
      }

      const updatedBoletas = await Promise.all(
        boletas.map(async (boleta) => {
          // --- INICIO DE LA LÓGICA MODIFICADA ---

          const {
            id,
            categoria,
            cantidadTickets,
            moneda,
            costo,
            valor,
            descripcion,
            imagenB64,
            entrance,
            avaliableCapacity, // Nuevo campo opcional en el request
          } = boleta;

          if (id == null || isNaN(id)) {
            throw new Error("El id de la boleta es obligatorio");
          }

          const boletasExistentes = ticketResult.Item.boleta || [];
          const boletaEncontrada = boletasExistentes.find((b) => b.id === id);

          let imagenboleta;
          let finalBoletaData;

          if (boletaEncontrada) {
            // --- LÓGICA PARA ACTUALIZAR UNA BOLETA EXISTENTE ---
            if (imagenB64 && imagenB64.trim() !== "") {
              // ... (lógica de subida de imagen existente, sin cambios)
              const key =
                boletaEncontrada.imgboleta ||
                `${ticketResult.Item.id}${id}${eventId}`;
              const bodyBuffer = Buffer.from(imagenB64, "base64");
              const s3Params = {
                Bucket,
                Key: key,
                Body: bodyBuffer,
                ContentEncoding: "base64",
                ContentType: "image/jpeg",
              };
              await s3.upload(s3Params).promise();
              imagenboleta = key;
            } else if (imagenB64 === "") {
              // ... (lógica de eliminación de imagen existente, sin cambios)
              if (boletaEncontrada.imgboleta) {
                await s3
                  .deleteObject({ Bucket, Key: boletaEncontrada.imgboleta })
                  .promise();
              }
              imagenboleta = "";
            } else {
              // Si no se envía imagenB64, se mantiene la imagen existente
              imagenboleta = boletaEncontrada.imgboleta;
            }

            // Fusiona la boleta existente con los datos del request
            finalBoletaData = {
              ...boletaEncontrada, // Base con datos antiguos
              ...boleta, // Sobrescribe con datos nuevos del request
              imgboleta: imagenboleta, // Asigna la imagen procesada
            };

            // Si se está actualizando la cantidad total, también se actualiza la capacidad disponible
            if (cantidadTickets !== undefined) {
              finalBoletaData.avaliableCapacity = cantidadTickets;
            }
          } else {
            // --- LÓGICA PARA CREAR UNA NUEVA BOLETA ---
            if (imagenB64 && imagenB64.trim() !== "") {
              // ... (lógica de subida de imagen para nueva boleta, sin cambios)
              const key = `${ticketResult.Item.id}${id}${eventId}`;
              const bodyBuffer = Buffer.from(imagenB64, "base64");
              const s3Params = {
                Bucket,
                Key: key,
                Body: bodyBuffer,
                ContentEncoding: "base64",
                ContentType: "image/jpeg",
              };
              await s3.upload(s3Params).promise();
              imagenboleta = key;
            }

            // Para una boleta nueva, se usan los datos del request
            finalBoletaData = {
              ...boleta,
              imgboleta: imagenboleta,
              // Se crea el campo 'avaliableCapacity' usando el valor de 'cantidadTickets'
              avaliableCapacity: cantidadTickets,
            };
          }

          return finalBoletaData;
          // --- FIN DE LA LÓGICA MODIFICADA ---
        })
      );
      function convertDateToComparableString(date) {
        // Si recibes "DD/MM/YYYY"
        const [day, month, year] = date.split("/");
        return `${year}${month}${day}`; // "20250510"
      }
      // Si se proporciona algún dato para actualizar, se hace la actualización
      const ticketUpdateParams = {
        TableName: process.env.TICKETS_TABLE || "Tickets",
        Key: { id: ticketId },
        UpdateExpression: [],
        ExpressionAttributeNames: {},
        ExpressionAttributeValues: {},
      };

      if (fechaIniVent) {
        ticketUpdateParams.UpdateExpression.push(
          "#fechaIniVent = :fechaIniVent"
        );
        ticketUpdateParams.ExpressionAttributeNames["#fechaIniVent"] =
          "fechaIniVent";
        ticketUpdateParams.ExpressionAttributeValues[":fechaIniVent"] =
          convertDateToComparableString(fechaIniVent);
      }
      if (fechaFinVent) {
        ticketUpdateParams.UpdateExpression.push(
          "#fechaFinVent = :fechaFinVent"
        );
        ticketUpdateParams.ExpressionAttributeNames["#fechaFinVent"] =
          "fechaFinVent";
        ticketUpdateParams.ExpressionAttributeValues[":fechaFinVent"] =
          convertDateToComparableString(fechaFinVent);
      }
      if (horaIniVent) {
        ticketUpdateParams.UpdateExpression.push("#horaIniVent = :horaIniVent");
        ticketUpdateParams.ExpressionAttributeNames["#horaIniVent"] =
          "horaIniVent";
        ticketUpdateParams.ExpressionAttributeValues[":horaIniVent"] =
          horaIniVent;
      }
      if (horaFinVent) {
        ticketUpdateParams.UpdateExpression.push("#horaFinVent = :horaFinVent");
        ticketUpdateParams.ExpressionAttributeNames["#horaFinVent"] =
          "horaFinVent";
        ticketUpdateParams.ExpressionAttributeValues[":horaFinVent"] =
          horaFinVent;
      }
      if (updatedBoletas) {
        ticketUpdateParams.UpdateExpression.push("#boleta = :boleta");
        ticketUpdateParams.ExpressionAttributeNames["#boleta"] = "boleta";
        ticketUpdateParams.ExpressionAttributeValues[":boleta"] =
          updatedBoletas;

        console.log("holaaaa" + updatedBoletas);
      }
      if (ticketUpdateParams.UpdateExpression.length > 0) {
        ticketUpdateParams.UpdateExpression = `SET ${ticketUpdateParams.UpdateExpression.join(
          ", "
        )}`;
        await dynamodb.update(ticketUpdateParams).promise();
      }

      // Procesar las boletas independientemente del `ticketId`
    }
    response = {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Ticket actualizado correctamente",
        data: [],
        //boletas: updatedBoletas,
      }),
    };
  } catch (error) {
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
