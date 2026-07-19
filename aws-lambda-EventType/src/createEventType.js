const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const dynamoDb = new AWS.DynamoDB.DocumentClient();

exports.createEventType = async (event) => {
  const bucketName = "aws-lambda-event-type";
  const tableName =
    process.env.EVENT_TYPE_TABLE || process.env.TABLE_NAME || "TipoEvento";

  try {
    const {
      id, 
      EventType_EN, 
      EventType_ES, 
      imageBase64 
    } = JSON.parse(event.body);

    if (
      !id || 
      !EventType_EN || 
      !EventType_ES || 
      !imageBase64
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Todos los campos son requeridos" }),
      };
    }

    const imageKey = `${id}.jpg`;
    const buffer = Buffer.from(imageBase64, "base64");

    await s3.putObject({
      Bucket: bucketName,
      Key: imageKey,
      Body: buffer,
      ContentType: "image/jpeg"
    }).promise();

    const imageUrl = imageKey;

    // 🗄 Guardar datos en DynamoDB
    const params = {
      TableName: tableName,
      Item: { 
        id, 
        EventType_EN, 
        EventType_ES, 
        imageUrl 
      },
    };

    await dynamoDb.put(params).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: "Tipo de evento creado exitosamente!", 
        imageUrl 
      }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "Error al crear el tipo de evento: " + error.message 
      }),
    };
  }
};