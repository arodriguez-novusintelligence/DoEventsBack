const AWS = require('aws-sdk');

const dynamoDB = new AWS.DynamoDB.DocumentClient({ 
  region: 'us-east-1'
});

async function inspectOrdersTable() {
  try {
    console.log('🔍 Inspeccionando estructura de la tabla Orders...');
    
    // Obtener algunas órdenes para ver la estructura
    const ordersResult = await dynamoDB.scan({
      TableName: 'Orders',
      Limit: 5
    }).promise();
    
    console.log(`📋 Total órdenes encontradas: ${ordersResult.Items.length}`);
    
    if (ordersResult.Items.length > 0) {
      console.log('\n📄 Estructura de las órdenes:');
      ordersResult.Items.forEach((order, index) => {
        console.log(`\n--- Orden ${index + 1} ---`);
        console.log('Keys:', Object.keys(order));
        console.log('Order data:', JSON.stringify(order, null, 2));
      });
      
      // Buscar órdenes con status APPROVED específicamente
      console.log('\n🔍 Buscando órdenes APPROVED...');
      const approvedOrdersResult = await dynamoDB.scan({
        TableName: 'Orders',
        FilterExpression: '#status = :approved',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':approved': 'APPROVED'
        },
        Limit: 3
      }).promise();
      
      console.log(`📋 Órdenes APPROVED encontradas: ${approvedOrdersResult.Items.length}`);
      if (approvedOrdersResult.Items.length > 0) {
        approvedOrdersResult.Items.forEach((order, index) => {
          console.log(`\n--- Orden APPROVED ${index + 1} ---`);
          console.log('Order data:', JSON.stringify(order, null, 2));
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

inspectOrdersTable().catch(console.error);