const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION || 'sa-east-1' });
const dynamodb = new AWS.DynamoDB.DocumentClient();

const EVENTS_TABLE = process.env.EVENTS_TABLE || 'Eventos-dev';
const TICKETS_TABLE = process.env.TICKETS_TABLE || 'Tickets-dev';
const TICKETS_DIST_TABLE = process.env.TICKETS_DIST_TABLE || 'TicketsDistribution-dev';

async function main() {
  const search = process.argv[2] || 'Copia de Concierto';
  const events = await dynamodb.scan({
    TableName: EVENTS_TABLE,
    FilterExpression: 'contains(#n, :name)',
    ExpressionAttributeNames: { '#n': 'nombre' },
    ExpressionAttributeValues: { ':name': search },
  }).promise();

  console.log(`Eventos encontrados: ${(events.Items || []).length}`);
  for (const ev of events.Items || []) {
    console.log('\n--- EVENT ---');
    console.log(JSON.stringify({
      id: ev.id,
      nombre: ev.nombre,
      userId: ev.userId,
      venueId: ev.venueId,
      estatus: ev.estatus,
      fechaIni: ev.fechaIni,
    }, null, 2));

    const tickets = await dynamodb.scan({
      TableName: TICKETS_TABLE,
      FilterExpression: 'eventId = :eventId',
      ExpressionAttributeValues: { ':eventId': ev.id },
    }).promise();

    console.log(`Tickets records: ${(tickets.Items || []).length}`);
    for (const t of tickets.Items || []) {
      console.log(JSON.stringify({
        id: t.id,
        eventId: t.eventId,
        venueId: t.venueId,
        hasSeating: t.hasSeating,
        boletasLen: Array.isArray(t.boletas) ? t.boletas.length : null,
        boletaKeys: t.boleta ? Object.keys(t.boleta) : null,
        boletaIsArray: Array.isArray(t.boleta),
      }, null, 2));
    }

    for (const keyName of ['eventId', 'id_evento', 'event_id']) {
      try {
        const dist = await dynamodb.query({
          TableName: TICKETS_DIST_TABLE,
          IndexName: 'eventIdIndex',
          KeyConditionExpression: `#k = :eventId`,
          ExpressionAttributeNames: { '#k': keyName },
          ExpressionAttributeValues: { ':eventId': ev.id },
          Limit: 3,
        }).promise();
        if (dist.Items?.length) {
          console.log(`Distributions via ${keyName}: ${dist.Count ?? dist.Items.length} (sample)`);
          console.log(JSON.stringify(dist.Items[0], null, 2));
          break;
        }
      } catch (e) {
        console.log(`Query ${keyName} failed:`, e.message);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
