const AWS = require('aws-sdk');
const doc = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS(); // Para notificar, opcional

const TICKETS_TABLE = process.env.TICKETS_TABLE || "Tickets";
const NOTIFY_TOPIC_ARN = process.env.NOTIFY_TOPIC_ARN; // SNS topic opcional

exports.handler = async (event) => {
  const updatedCategorias = {};

  for (const record of event.Records) {
    if (record.eventName !== "REMOVE") continue;

    // El NEW/OLD image depende del tipo de trigger, aquí OLD tiene el ticket expirado
    const oldImg = AWS.DynamoDB.Converter.unmarshall(record.dynamodb.OldImage);

    // Solo liberar si estaba reservado
    if (oldImg.ticketStatus !== "RESERVED" && oldImg.ticketStatus !== "RESERVED_PENDING_PAYMENT") continue;

    // Actualizar contadores por categoría y evento
    const clave = `${oldImg.eventId}#${oldImg.category}`;
    updatedCategorias[clave] = (updatedCategorias[clave] || 0) + 1;

    // Notificación opcional al usuario
    if (oldImg.ownerId && NOTIFY_TOPIC_ARN) {
      try {
        await sns.publish({
          TopicArn: NOTIFY_TOPIC_ARN,
          Message: JSON.stringify({
            userId: oldImg.ownerId,
            ticketInstanceId: oldImg.ticketInstanceId,
            eventId: oldImg.eventId,
            category: oldImg.category,
            message: "Tu reserva expiró y el ticket fue liberado.",
            type: "TICKET_RESERVATION_EXPIRED"
          }),
          Subject: "Reserva de ticket expirada"
        }).promise();
      } catch (err) {
        console.error(`Error notificando expiración para ${oldImg.ownerId}:`, err.message);
      }
    }
  }

  // Actualizar la disponibilidad en la tabla Tickets
  for (const clave in updatedCategorias) {
    const [eventId, category] = clave.split('#');

    // Obtener la fila de Tickets por eventId
    const res = await doc.query({
      TableName: TICKETS_TABLE,
      IndexName: "eventIdIndex",
      KeyConditionExpression: "eventId = :eventId",
      ExpressionAttributeValues: { ":eventId": eventId }
    }).promise();

    if (!res.Items || res.Items.length === 0) continue;

    const ticketRow = res.Items[0];
    const rawBoleta = Array.isArray(ticketRow.boletas)
      ? ticketRow.boletas
      : Array.isArray(ticketRow.boleta)
        ? ticketRow.boleta
        : [];
    let boleta = [...rawBoleta];
    const idx = boleta.findIndex(b => b.categoria === category);

    if (idx !== -1) {
      // Incrementa disponibilidad y resta reserved
      boleta[idx].avaliableCapacity = (parseInt(boleta[idx].avaliableCapacity) + updatedCategorias[clave]).toString();
      boleta[idx].reservedTickets = Math.max(parseInt(boleta[idx].reservedTickets) - updatedCategorias[clave], 0);
    }

    await doc.update({
      TableName: TICKETS_TABLE,
      Key: { id: ticketRow.id },
      UpdateExpression: "SET boletas = :boleta",
      ExpressionAttributeValues: { ":boleta": boleta }
    }).promise();
  }

  return { status: 'OK', categoriesUpdated: Object.keys(updatedCategorias).length };
};
