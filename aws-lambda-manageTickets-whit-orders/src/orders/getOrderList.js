const AWS = require("aws-sdk");
AWS.config.update({ region: process.env.AWS_REGION });

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3({ signatureVersion: "v4" });

const ORD_TABLE = process.env.ORDERS_TABLE;
const EVENT_TABLE = process.env.EVENTS_TABLE;
const IMAGE_TABLE = process.env.IMAGE_TABLE;
const S3_BUCKET = process.env.IMAGE_BUCKET;

exports.handler = async (event) => {
  const { userId } = event.pathParameters;
  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "userId is required" }),
    };
  }

  // 1. Get orders for user
  const orderParams = {
    TableName: ORD_TABLE,
    IndexName: "user_id-created_at-index", // Assumes a GSI on userId
    KeyConditionExpression: "user_id = :uid",
    FilterExpression: "transaction_status = :approved",
    ExpressionAttributeValues: { ":uid": userId, ":approved": "APPROVED" },
  };

  let orders;
  try {
    const orderData = await dynamoDb.query(orderParams).promise();
    orders = orderData.Items;
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error fetching orders", details: err }),
    };
  }

  if (!orders || orders.length === 0) {
    return { statusCode: 200, body: JSON.stringify([]) };
  }

  // 2. Get event and image info for each order
  const enrichedOrders = await Promise.all(
    orders.map(async (order) => {
      // Get event info
      let eventInfo = {};
      try {
        const eventRes = await dynamoDb
          .get({
            TableName: EVENT_TABLE,
            Key: { id: order.event_id },
          })
          .promise();
        if (eventRes.Item) {
          eventInfo.name = eventRes.Item.nombre;
          const fechaIni = eventRes.Item.fechaIni;
          let FechaIni = "";
          FechaIni = `${fechaIni.substring(6, 8)}/${fechaIni.substring(
            4,
            6
          )}/${fechaIni.substring(0, 4)}`;
          eventInfo.fechaIni = FechaIni;
        }
      } catch {}

      const consultaImagen = async (event) => {
        // metodo que consulta y firma la primera imagen de un evento

        let imagen = " ";
        console.log(event + " Inicio consulta imagen");
        const paramsImage = {
          TableName: IMAGE_TABLE, // Nombre de la tabla
          IndexName: "eventIdIndex", // Nombre del índice secundario global (si aplica)
          KeyConditionExpression: "id_evento = :id_evento",
          ExpressionAttributeValues: {
            ":id_evento": event,
          },
        };

        // Ejecutar consulta
        const result = await dynamoDb.query(paramsImage).promise();

        if (!result.Items || result.Items.length === 0) {
          return (imagen = " ");
        }
        const Imagenes = result.Items[0].imagenesCargadas;
        if (!Imagenes || Imagenes.length === 0) {
          return (imagen = " ");
        }
        imagen = Imagenes[0];

        const getImageUrl = (bucketName, key) => {
          const params = {
            Bucket: bucketName,
            Key: key,
          };

          // Obtén la URL de la imagen
          return s3.getSignedUrl("getObject", params);
        };

        let key;
        const posicionInicial = imagen.indexOf(".com/");
        if (posicionInicial === -1) {
          key = imagen;
        } else {
          key = imagen.substring(imagen.indexOf(".com/") + 5);
        }
        imagen = getImageUrl(S3_BUCKET, key);
        return imagen;
      };

      await Promise.all(
        orders.map(async (datos) => {
          let eventId = datos.event_id;

          datos.imagen = await consultaImagen(eventId);
        })
      );
      // Get image info

      return {
        ...order,
        ...eventInfo,
      };
    })
  );

  return {
    statusCode: 200,
    body: JSON.stringify(enrichedOrders),
  };
};
