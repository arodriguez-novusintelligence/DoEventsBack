const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: 'us-east-1' });

const eventId = '45969122-45ff-4d0f-81c2-e178237e66a2';

async function scanTickets() {
  console.log('🔍 Escaneando tabla Tickets para eventId:', eventId);
  
  try {
    const result = await dynamodb.scan({
      TableName: 'Tickets',
      FilterExpression: 'eventId = :eventId',
      ExpressionAttributeValues: {
        ':eventId': eventId
      }
    }).promise();
    
    console.log(`✅ Encontrados ${result.Items.length} registros en Tickets`);
    
    if (result.Items.length > 0) {
      const ticket = result.Items[0];
      console.log('\n📝 Registro de Ticket:');
      console.log(JSON.stringify(ticket, null, 2));
    } else {
      console.log('❌ NO SE ENCONTRÓ REGISTRO EN TICKETS - Este es el problema!');
      console.log('La función cloneVenueForEventHandler NO creó el registro en Tickets');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

scanTickets().catch(console.error);
