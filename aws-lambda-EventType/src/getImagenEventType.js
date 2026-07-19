const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const dynamoDb = new AWS.DynamoDB.DocumentClient();

exports.getImagenEventType = async () => {
  const tableName =
    process.env.EVENT_TYPE_TABLE || process.env.TABLE_NAME || "TipoEvento";
  const bucketName = "aws-lambda-event-type";
  const region = "us-east-1";

  try {
    const params = {
      TableName: tableName,
    };

    const data = await dynamoDb.scan(params).promise(); // Obtener todos los registros

    if (!data.Items || data.Items.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "No se encontraron eventos" }),
      };
    }

    // 🌐 Construir URLs públicas para cada imagen
    const eventTypes = data.Items.map(event => {
      let url = "No disponible";

      if (event.imageUrl) {
        url = `https://${bucketName}.s3.${region}.amazonaws.com/${event.imageUrl}`;
      }

      return {
        id: event.id,
        EventType_EN: event.EventType_EN,
        EventType_ES: event.EventType_ES,
        imageUrl: url, // URL pública para acceder a la imagen
      };
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, eventTypes }),
    };

  } catch (error) {
    console.error("Error al obtener los eventos:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error al obtener los eventos" }),
    };
  }
};