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
    const datosBoleta = data.Items[0].boleta || [];
    const getImageUrl = (bucketName, key) => {
      const params = {
        Bucket: bucketName,
        Key: key,
      };

      // Obtén la URL de la imagen
      return s3.getSignedUrl("getObject", params);
    };

    /*datosBoleta.map((boleta) => {
      let key = data.Items[0].id + boleta.id + data.Items[0].eventId;
      if (boleta.imgboleta) {
        boleta.imgboleta = getImageUrl("lambdaboletasbucket", key);
      }
    });*/
    await Promise.all(
      datosBoleta.map(async (boleta) => {
        if (!boleta.imgboleta) {
          boleta.imgboleta = " ";

          return;
        } else {
          let key = boleta.imgboleta;
          boleta.imgboleta = getImageUrl("lambdaboletasbucket", key);
        }
      })
    );
    // Transformar fechaIniVent y fechaFinVent de YYYYMMDD a DD/MM/YYYY
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
      body: JSON.stringify(data.Items /*boletasUrl: datosBoleta*/),
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
