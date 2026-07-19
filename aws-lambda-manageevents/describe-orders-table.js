const AWS = require('aws-sdk');

const dynamoDB = new AWS.DynamoDB({ 
  region: 'us-east-1'
});

async function describeOrdersTable() {
  try {
    console.log('🔍 Describiendo la estructura de la tabla "Orders"...');
    
    const result = await dynamoDB.describeTable({
      TableName: 'Orders'
    }).promise();
    
    console.log('\n📋 Información de la tabla:');
    console.log('Nombre:', result.Table.TableName);
    console.log('Estado:', result.Table.TableStatus);
    
    console.log('\n🔑 Esquema de claves primarias:');
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
        console.log(`  Estado: ${gsi.IndexStatus}`);
        gsi.KeySchema.forEach(key => {
          console.log(`  - ${key.AttributeName} (${key.KeyType})`);
        });
        if (gsi.Projection) {
          console.log(`  Proyección: ${gsi.Projection.ProjectionType}`);
        }
      });
    } else {
      console.log('\n❌ No hay índices secundarios globales');
    }
    
    if (result.Table.LocalSecondaryIndexes) {
      console.log('\n📊 Índices secundarios locales:');
      result.Table.LocalSecondaryIndexes.forEach(lsi => {
        console.log(`- ${lsi.IndexName}:`);
        lsi.KeySchema.forEach(key => {
          console.log(`  - ${key.AttributeName} (${key.KeyType})`);
        });
      });
    }
    
  } catch (error) {
    console.error('❌ Error describiendo tabla:', error);
  }
}

describeOrdersTable().catch(console.error);