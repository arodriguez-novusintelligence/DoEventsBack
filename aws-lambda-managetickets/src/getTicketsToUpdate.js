const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
exports.getTicketByEventId = async (event) => {
  let response;

  try {
    // Obtener el id del evento desde los parámetros de la solicitud
    const { eventId } = event.pathParameters;

    if (!eventId) {
      throw new Error("El id del evento es obligatorio");
    }

    // Parámetros de consulta para obtener los tickets por el id del evento
    const params = {
      TableName: process.env.TICKETS_TABLE || "Tickets", // Nombre de la tabla
      IndexName: "eventIdIndex", // Nombre del índice secundario global (si aplica)
      KeyConditionExpression: "eventId = :eventId",
      ExpressionAttributeValues: {
        ":eventId": eventId,
      },
    };

    // Realizar la consulta a DynamoDB
    const data = await dynamodb.query(params).promise();
    console.log(data.Items); //datosBoleta = data.fechaFinVent;
    // Verificar si se encontraron tickets
    if (!data.Items || data.Items.length === 0) {
      throw new Error("Evento no encontrado");
    }
    const paramsEvt = {
      TableName: process.env.EVENTS_TABLE || "Eventos", // Nombre de la tabla
      Key: {
        id: eventId,
      },
      ProjectionExpression: "categoriaReembolso", // Reemplaza 'campoEspecifico' con el nombre del campo que necesitas
    };

    // Realizar la consulta a DynamoDB para obtener el campo específico del evento
    const eventData = await dynamodb.get(paramsEvt).promise();

    // Verificar si se encontró el evento
    if (!eventData.Item) {
      throw new Error("Evento no encontrado en la tabla Eventos");
    }

    // Obtener el campo específico del evento
    const categoriaReembolso = eventData.Item.categoriaReembolso;

    const datosBoleta = data.Items[0].boleta;
    const getImageUrl = (bucketName, key) => {
      const params = {
        Bucket: bucketName,
        Key: key,
      };

      // Obtén la URL de la imagen
      return s3.getSignedUrl("getObject", params);
    };
    const getImageBase64 = async (bucketName, key) => {
      const params = {
        Bucket: bucketName,
        Key: key,
      };

      const data = await s3.getObject(params).promise();

      return data.Body.toString("base64");
    };

    await Promise.all(
      datosBoleta.map(async (boleta) => {
        if (!boleta.imgboleta) {
          boleta.imgboleta = " ";
          boleta.imgB64 = " ";
          return;
        } else {
          let key = boleta.imgboleta;
          boleta.imgboleta = getImageUrl("lambdaboletasbucket", key);
          boleta.imgB64 = await getImageBase64("lambdaboletasbucket", key);
          console.log(boleta.imgB64);
        }
      })
    );
    data.Items.forEach((item) => {
      if (item.fechaIniVent) {
        const fechaIni = item.fechaIniVent;
        item.fechaIniVent = `${fechaIni.substring(6, 8)}/${fechaIni.substring(
          4,
          6
        )}/${fechaIni.substring(0, 4)}`;
      }
      if (item.fechaFinVent) {
        const fechaFin = item.fechaFinVent;
        item.fechaFinVent = `${fechaFin.substring(6, 8)}/${fechaFin.substring(
          4,
          6
        )}/${fechaFin.substring(0, 4)}`;
      }
    });
    //data.Items[0].boleta = datosBoleta;
    response = {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        {
          success: true,
          message: "Consulta realizada correctamente",
          data: { datosBoleta: data.Items, reembolso: categoriaReembolso },
        } /*boletasUrl: datosBoleta*/
      ),
    };
  } catch (error) {
    console.error("Error al obtener el evento:", error);
    let errorMessage = "Error interno del servidor";
    let statusCode = 500;
    if (error.message === "El id del evento es obligatorio") {
      errorMessage = error.message;
      statusCode = 400;
    } else if (error.message === "Evento no encontrado") {
      errorMessage = error.message;
      statusCode = 404;
    }
    response = {
      statusCode,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        statusDesc: errorMessage,
        message: error.message,
        statusCode,
      }),
    };
  }
  return response;
};
