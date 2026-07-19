const AWS = require('aws-sdk');

const dynamoDB = new AWS.DynamoDB({ 
  region: 'us-east-1'
});

async function listTables() {
  try {
    console.log('🔍 Listando todas las tablas DynamoDB...');
    
    const result = await dynamoDB.listTables().promise();
    
    console.log(`📋 Total de tablas encontradas: ${result.TableNames.length}`);
    console.log('\n📚 Tablas disponibles:');
    
    result.TableNames.forEach((tableName, index) => {
      console.log(`${index + 1}. ${tableName}`);
    });
    
    // Buscar tablas que puedan ser de eventos
    const eventTables = result.TableNames.filter(name => 
      name.toLowerCase().includes('event') || 
      name.toLowerCase().includes('evento')
    );
    
    if (eventTables.length > 0) {
      console.log('\n🎯 Tablas relacionadas con eventos:');
      eventTables.forEach((tableName, index) => {
        console.log(`${index + 1}. ${tableName}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error listando tablas:', error);
  }
}

listTables().catch(console.error);