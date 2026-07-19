const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.obtenerDatosBancariosByUserId = async (event) => {
  let response;

  try {
    // Obtener el id del dato bancario desde los parámetros de la solicitud
    const { userID } = event.pathParameters;

    if (!userID) {
      throw new Error("El userID es obligatorio");
    }
    // Parámetros de consulta para obtener el dato bancario por su id
    const params = {
      TableName: process.env.DATOS_BANCARIOS_TABLE || "DatosBancarios",
      IndexName: "UserIdIndex",
      KeyConditionExpression: "userID = :userID",
      ExpressionAttributeValues: {
        ":userID": userID,
      },
    };

    // Realizar la consulta a DynamoDB
    const data = await dynamodb.query(params).promise();
    const items = (data.Items || []).sort((a, b) => {
      if ((a.isDefault === true) !== (b.isDefault === true)) {
        return a.isDefault === true ? -1 : 1;
      }
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });

    if (!items.length) {
      response = {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: "Dato bancario no encontrado",
        }),
      };
    } else {
      const defaultItem = items.find((item) => item.isDefault === true) || null;
      const primaryItem = defaultItem || items[0] || null;
      response = {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: "Datos bancarios del usuario consultados correctamente",
          data: {
            userID,
            total: items.length,
            hasDefault: items.some((item) => item.isDefault === true),
            // Backward compatibility for clients expecting a single id in data.id
            id: primaryItem?.id || null,
            defaultId: defaultItem?.id || null,
            items,
          },
        }),
      };
    }
  } catch (error) {
    console.error("Error al obtener el dato bancario:", error);
    response = {
      statusCode: 500,
      body: JSON.stringify({
        error: "No se pudo obtener el dato bancario",
      }),
    };
  }

  return response;
};
