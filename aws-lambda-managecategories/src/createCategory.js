const AWS = require("aws-sdk");
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

exports.createCategory = async (event) => {
  try {
    const {
      id, 
      Category_EN, 
      Category_ES,
      imagen, // Debe ser una string en Base64
    } = JSON.parse(event.body);

    if (!id || !Category_EN || !Category_ES || !imagen) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Todos los campos son requeridos." }),
      };
    }

    const Bucket = "doeventimagecategories";
    const key = `${id}Category.jpg`; // Asegurar extensión

    const s3Params = {
      Bucket,
      Key: key,
      Body: Buffer.from(imagen, "base64"),
      ContentEncoding: "base64",
      ContentType: "image/jpeg",
    };

    // Subir imagen a S3
    await s3.putObject(s3Params).promise();

    // Crear URL de la imagen
    const imagenURL = `https://${Bucket}.s3.amazonaws.com/${key}`;

    // Guardar en DynamoDB
    const params = {
      TableName: process.env.CATEGORIES_TABLE || "EventosCategorias",
      Item: {
        id,
        Category_EN,
        Category_ES,
        imagen: imagenURL, // Guardar URL de imagen
      },
    };

    await dynamoDb.put(params).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Categoría creada exitosamente!",
        imagenURL,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Error al crear la categoría: " + error.message,
      }),
    };
  }
};