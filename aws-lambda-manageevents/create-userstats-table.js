const AWS = require('aws-sdk');

AWS.config.update({ region: 'us-east-1' });
const dynamodb = new AWS.DynamoDB();

const tableParams = {
  TableName: 'UserStats',
  KeySchema: [
    {
      AttributeName: 'userId',
      KeyType: 'HASH' // Partition key
    }
  ],
  AttributeDefinitions: [
    {
      AttributeName: 'userId',
      AttributeType: 'S'
    }
  ],
  BillingMode: 'PAY_PER_REQUEST' // On-demand billing
};

async function createTable() {
  try {
    console.log('📊 Creando tabla UserStats...');
    
    // Verificar si la tabla ya existe
    try {
      await dynamodb.describeTable({ TableName: 'UserStats' }).promise();
      console.log('✅ La tabla UserStats ya existe');
      return;
    } catch (err) {
      if (err.code !== 'ResourceNotFoundException') {
        throw err;
      }
      // La tabla no existe, proceder a crearla
    }

    const result = await dynamodb.createTable(tableParams).promise();
    console.log('✅ Tabla UserStats creada exitosamente');
    console.log('Esperando a que la tabla esté activa...');
    
    await dynamodb.waitFor('tableExists', { TableName: 'UserStats' }).promise();
    console.log('✅ Tabla UserStats está activa y lista para usar');
    
    console.log('\n📋 Estructura de la tabla:');
    console.log('- Partition Key: userId (String)');
    console.log('- Atributos:');
    console.log('  * publishedEventsCount: Cantidad de eventos publicados');
    console.log('  * lastPublishedEventId: ID del último evento publicado');
    console.log('  * lastPublishedAt: Fecha del último evento publicado');
    
  } catch (error) {
    console.error('❌ Error al crear la tabla:', error);
    throw error;
  }
}

createTable()
  .then(() => {
    console.log('\n✅ Proceso completado exitosamente');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  });
