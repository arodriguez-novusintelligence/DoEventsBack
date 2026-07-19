const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const doc = DynamoDBDocumentClient.from(ddbClient);

const TICKETS_DIST_TABLE = process.env.TICKETS_DIST_TABLE;

exports.handler = async (event) => {
  const build = (code, body) => ({
    statusCode: code,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(body, null, 2)
  });

  try {
    const distributionId = event.pathParameters?.distributionId;
    const createDate = event.queryStringParameters?.createDate;

    if (!distributionId || !createDate) {
      return build(400, { 
        error: 'MissingParameters', 
        message: 'distributionId y createDate son requeridos',
        example: '/tickets-distribution/{distributionId}/available-seats?createDate=2026-01-12T15:30:00.000Z'
      });
    }

    console.log(`Consultando distribution: ${distributionId}, createDate: ${createDate}`);

    // Consultar TicketsDistribution con clave compuesta
    const result = await doc.send(
      new GetCommand({
        TableName: TICKETS_DIST_TABLE,
        Key: {
          id: distributionId,
          createDate: createDate,
        },
      }),
    );

    if (!result.Item) {
      return build(404, { 
        error: 'NotFound', 
        message: `Distribution no encontrada: ${distributionId}`,
        distributionId,
        createDate
      });
    }

    const distribution = result.Item;
    const tickets = distribution.tickets || [];

    console.log(`Total tickets en distribution: ${tickets.length}`);

    // Separar por estado
    const available = tickets.filter(t => t.ticketStatus === 'AVAILABLE');
    const reserved = tickets.filter(t => t.ticketStatus === 'RESERVED');
    const sold = tickets.filter(t => t.ticketStatus === 'SOLD');

    console.log(`Disponibles: ${available.length}, Reservados: ${reserved.length}, Vendidos: ${sold.length}`);

    // Mapear información de asientos
    const seatsInfo = tickets.map(ticket => ({
      ticketInstanceId: ticket.ticketInstanceId,
      location: ticket.location || {},
      ticketStatus: ticket.ticketStatus,
      price: ticket.purchasePrice || 0,
      ownerId: ticket.ownerId || null,
      qrCodeKey: ticket.qrCodeKey,
      orderId: ticket.orderId || null
    }));

    // Ordenar por fila y número si tienen location
    seatsInfo.sort((a, b) => {
      if (a.location.row && b.location.row) {
        if (a.location.row !== b.location.row) {
          return a.location.row.localeCompare(b.location.row);
        }
        return (a.location.number || 0) - (b.location.number || 0);
      }
      return 0;
    });

    return build(200, {
      distributionId: distribution.id,
      categoryId: distribution.boletaId,
      categoryName: distribution.categoryName,
      categoryColor: distribution.categoryColor || null,
      eventId: distribution.eventId,
      venueId: distribution.venueId,
      ticketId: distribution.ticketId,
      summary: {
        totalSeats: tickets.length,
        availableSeats: available.length,
        reservedSeats: reserved.length,
        soldSeats: sold.length
      },
      seats: seatsInfo
    });

  } catch (err) {
    console.error('getAvailableSeats error:', err);
    return build(500, { 
      error: 'InternalError', 
      message: err.message,
      details: err.stack
    });
  }
};
