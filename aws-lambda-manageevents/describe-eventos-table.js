const AWS = require('aws-sdk');

const dynamoDB = new AWS.DynamoDB({ 
  region: 'us-east-1'
});

async function describeEventosTable() {
  try {
    console.log('🔍 Describiendo la estructura de la tabla "Eventos"...');
    
    const result = await dynamoDB.describeTable({
      TableName: 'Eventos'
    }).promise();
    
    console.log('\n📋 Información de la tabla:');
    console.log('Nombre:', result.Table.TableName);
    console.log('Estado:', result.Table.TableStatus);
    
    console.log('\n🔑 Esquema de claves:');
    result.Table.KeySchema.forEach(key => {
      console.log(`- ${key.AttributeName} (${key.KeyType})`);
    });
    
    console.log('\n📊 Definiciones de atributos:');
    result.Table.AttributeDefinitions.forEach(attr => {
      console.log(`- ${attr.AttributeName}: ${attr.AttributeType}`);
    });
    
    if (result.Table.GlobalSecondaryIndexes) {
      console.log('\n📊 Índices secundarios globales:');
      result.Table.GlobalSecondaryIndexes.forEach(gsi => {
        console.log(`- ${gsi.IndexName}:`);
        gsi.KeySchema.forEach(key => {
          console.log(`  - ${key.AttributeName} (${key.KeyType})`);
        });
      });
    }
    
  } catch (error) {
    console.error('❌ Error describiendo tabla:', error);
  }
}

describeEventosTable().catch(console.error);