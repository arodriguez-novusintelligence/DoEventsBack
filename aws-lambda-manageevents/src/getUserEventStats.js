const AWS = require("aws-sdk");

AWS.config.update({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-1",
});

const dynamodb = new AWS.DynamoDB.DocumentClient();

const EVENTS_TABLE = process.env.EVENTS_TABLE || "Eventos";
const IMAGE_TABLE = process.env.IMAGE_TABLE || "imagenes";
const PROMO_CODES_TABLE = process.env.PROMO_CODES_TABLE || "EventPromoCodes-dev";
const IMAGE_BUCKET = process.env.IMAGE_BUCKET || "doeventimageeventbucket";

const {
  getOrdersByEvent,
  normalizeOrderAmount,
  normalizeTicketsCount,
  isOrderExecutedSale,
} = require("./statsShared");

const isDeletedEvent = (item) =>
  String(item?.estatus || "").trim().toUpperCase() === "DELETED";

const getImageUrl = (bucketName, key) =>
  `https://${bucketName}.s3.amazonaws.com/${key}`;

async function consultaImagen(eventId) {
  const paramsImage = {
    TableName: IMAGE_TABLE,
    IndexName: "eventIdIndex",
    KeyConditionExpression: "id_evento = :id_evento",
    ExpressionAttributeValues: {
      ":id_evento": eventId,
    },
  };

  const result = await dynamodb.query(paramsImage).promise();
  if (!result.Items?.length) return " ";

  const imagenes = result.Items[0].imagenesCargadas;
  if (!imagenes?.length) return " ";

  let imagen = imagenes[0];
  const posicionInicial = imagen.indexOf(".com/");
  const key =
    posicionInicial === -1
      ? imagen
      : imagen.substring(imagen.indexOf(".com/") + 5);
  return getImageUrl(IMAGE_BUCKET, key);
}

async function countPromoRedemptions(eventId) {
  const items = [];
  let lastKey;

  do {
    const result = await dynamodb
      .query({
        TableName: PROMO_CODES_TABLE,
        KeyConditionExpression: "eventId = :eventId",
        ExpressionAttributeValues: { ":eventId": eventId },
        ExclusiveStartKey: lastKey,
      })
      .promise();
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items.filter(
    (item) =>
      String(item.status || "").toUpperCase() === "REDEEMED" ||
      Boolean(item.redeemedAt),
  ).length;
}

async function computeEventSalesStats(eventId) {
  const orders = await getOrdersByEvent(eventId);
  const executedOrders = orders.filter(isOrderExecutedSale);

  const ticketsAprobados = executedOrders.reduce(
    (sum, order) => sum + normalizeTicketsCount(order),
    0,
  );
  const amountCentsAprobados = executedOrders.reduce(
    (sum, order) => sum + normalizeOrderAmount(order),
    0,
  );

  return { ticketsAprobados, amountCentsAprobados };
}

exports.getEventByUser = async (event) => {
  try {
    const { userId } = event.pathParameters || {};
    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "userId is required" }),
      };
    }

    const fechaActual = event.queryStringParameters?.fechaActual;
    const limitRaw = event.queryStringParameters?.limit;
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const allEvents = event.queryStringParameters?.allEvents !== "false";

    const params = {
      TableName: EVENTS_TABLE,
      IndexName: "userIdIndex",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    };

    if (!allEvents) {
      if (fechaActual) {
        params.FilterExpression =
          "fechaIni >= :fechaActual AND (estatus = :activo OR estatus = :ejecucion OR estatus = :enEjecucion)";
        params.ExpressionAttributeValues[":fechaActual"] = fechaActual;
      } else {
        params.FilterExpression =
          "estatus = :activo OR estatus = :ejecucion OR estatus = :enEjecucion";
      }
      params.ExpressionAttributeValues[":activo"] = "activo";
      params.ExpressionAttributeValues[":ejecucion"] = "ejecucion";
      params.ExpressionAttributeValues[":enEjecucion"] = "en_ejecucion";
    }

    const data = await dynamodb.query(params).promise();
    let datosEvento = (data.Items || []).filter((item) => !isDeletedEvent(item));

    datosEvento.sort((a, b) => {
      const dateA = new Date(a.createDate).getTime();
      const dateB = new Date(b.createDate).getTime();
      return dateB - dateA;
    });

    if (Number.isFinite(limit) && limit > 0) {
      datosEvento = datosEvento.slice(0, limit);
    }

    datosEvento.forEach((item) => {
      if (item.fechaIni && /^\d{8}$/.test(String(item.fechaIni))) {
        const fechaIni = String(item.fechaIni);
        item.fechaIni = `${fechaIni.substring(6, 8)}/${fechaIni.substring(
          4,
          6,
        )}/${fechaIni.substring(0, 4)}`;
      }
      if (item.fechaFin && /^\d{8}$/.test(String(item.fechaFin))) {
        const fechaFin = String(item.fechaFin);
        item.fechaFin = `${fechaFin.substring(6, 8)}/${fechaFin.substring(
          4,
          6,
        )}/${fechaFin.substring(0, 4)}`;
      }
    });

    await Promise.all(
      datosEvento.map(async (item) => {
        item.imagen = await consultaImagen(item.id);
        try {
          const [sales, promoRedeemed] = await Promise.all([
            computeEventSalesStats(item.id),
            countPromoRedemptions(item.id),
          ]);
          item.ticketsAprobados = sales.ticketsAprobados;
          item.amountCentsAprobados = sales.amountCentsAprobados;
          item.codigosPromoRedimidos = promoRedeemed;
        } catch (err) {
          console.error(`Error fetching stats for event ${item.id}:`, err);
          item.ticketsAprobados = 0;
          item.amountCentsAprobados = 0;
          item.codigosPromoRedimidos = 0;
        }
      }),
    );

    datosEvento.forEach((item) => {
      if (item.calificacion === undefined) item.calificacion = 0;
      if (item.visualizaciones === undefined) item.visualizaciones = 0;
      if (item.invitados === undefined) item.invitados = 0;
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        data: { datosEvento },
      }),
    };
  } catch (error) {
    console.error("Error al obtener estadísticas de eventos:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
