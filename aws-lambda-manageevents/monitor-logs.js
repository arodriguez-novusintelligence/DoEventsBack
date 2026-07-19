const AWS = require('aws-sdk');

const cloudWatchLogs = new AWS.CloudWatchLogs({
  region: 'us-east-1'
});

async function getRecentLogs() {
  try {
    console.log('📋 Buscando logs recientes de las funciones...');
    
    // Nombres de los log groups para las funciones
    const logGroups = [
      '/aws/lambda/aws-lambda-manageevent-dev-rescheduleEvent',
      '/aws/lambda/aws-lambda-manageevent-dev-cancelEvent'
    ];
    
    for (const logGroupName of logGroups) {
      console.log(`\n🔍 Revisando logs de: ${logGroupName}`);
      
      try {
        // Obtener streams más recientes
        const streamsResult = await cloudWatchLogs.describeLogStreams({
          logGroupName: logGroupName,
          orderBy: 'LastEventTime',
          descending: true,
          limit: 3
        }).promise();
        
        if (streamsResult.logStreams.length === 0) {
          console.log('❌ No se encontraron log streams');
          continue;
        }
        
        // Obtener eventos de los streams más recientes
        for (const stream of streamsResult.logStreams.slice(0, 2)) {
          console.log(`\n📄 Stream: ${stream.logStreamName}`);
          console.log(`⏰ Última actividad: ${new Date(stream.lastEventTime).toISOString()}`);
          
          const eventsResult = await cloudWatchLogs.getLogEvents({
            logGroupName: logGroupName,
            logStreamName: stream.logStreamName,
            startTime: Date.now() - (60 * 60 * 1000), // Última hora
            limit: 50
          }).promise();
          
          if (eventsResult.events.length > 0) {
            console.log(`📝 Eventos recientes (${eventsResult.events.length}):`);
            eventsResult.events.forEach((event, index) => {
              const timestamp = new Date(event.timestamp).toISOString();
              console.log(`${index + 1}. [${timestamp}] ${event.message}`);
            });
          } else {
            console.log('📝 No hay eventos recientes en este stream');
          }
        }
        
      } catch (error) {
        if (error.code === 'ResourceNotFoundException') {
          console.log(`❌ Log group no encontrado: ${logGroupName}`);
        } else {
          console.log(`❌ Error accediendo a logs: ${error.message}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

async function monitorLogs() {
  console.log('🚀 Iniciando monitoreo de logs...');
  console.log('👁️  Presiona Ctrl+C para detener\n');
  
  // Función para obtener logs cada 10 segundos
  const interval = setInterval(async () => {
    console.log('\n' + '='.repeat(80));
    console.log(`🔄 Actualizando logs - ${new Date().toISOString()}`);
    console.log('='.repeat(80));
    await getRecentLogs();
  }, 10000);
  
  // Obtener logs inmediatamente
  await getRecentLogs();
  
  // Manejar Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n🛑 Deteniendo monitoreo de logs...');
    clearInterval(interval);
    process.exit(0);
  });
}

// Función para buscar errores específicos
async function searchErrors() {
  try {
    console.log('🔍 Buscando errores recientes...');
    
    const logGroups = [
      '/aws/lambda/aws-lambda-manageevent-dev-rescheduleEvent',
      '/aws/lambda/aws-lambda-manageevent-dev-cancelEvent'
    ];
    
    for (const logGroupName of logGroups) {
      console.log(`\n🔍 Buscando errores en: ${logGroupName}`);
      
      try {
        const searchResult = await cloudWatchLogs.filterLogEvents({
          logGroupName: logGroupName,
          startTime: Date.now() - (24 * 60 * 60 * 1000), // Últimas 24 horas
          filterPattern: '[timestamp, requestId="*", level="ERROR"] OR [timestamp, level="ERROR"] OR "ERROR" OR "Error" OR "error" OR "CANCEL ERROR" OR "RESCHEDULE ERROR"'
        }).promise();
        
        if (searchResult.events.length > 0) {
          console.log(`❌ Errores encontrados (${searchResult.events.length}):`);
          searchResult.events.forEach((event, index) => {
            const timestamp = new Date(event.timestamp).toISOString();
            console.log(`\n${index + 1}. [${timestamp}]`);
            console.log(`Stream: ${event.logStreamName}`);
            console.log(`Message: ${event.message}`);
          });
        } else {
          console.log('✅ No se encontraron errores recientes');
        }
        
      } catch (error) {
        if (error.code === 'ResourceNotFoundException') {
          console.log(`❌ Log group no encontrado: ${logGroupName}`);
        } else {
          console.log(`❌ Error buscando: ${error.message}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error general buscando errores:', error);
  }
}

// Función para listar todos los log groups disponibles
async function listLogGroups() {
  try {
    console.log('📋 Listando todos los log groups disponibles...');
    
    const result = await cloudWatchLogs.describeLogGroups({
      logGroupNamePrefix: '/aws/lambda/aws-lambda-manageevent'
    }).promise();
    
    if (result.logGroups.length > 0) {
      console.log(`\n📄 Log groups encontrados (${result.logGroups.length}):`);
      result.logGroups.forEach((group, index) => {
        console.log(`${index + 1}. ${group.logGroupName}`);
        if (group.creationTime) {
          console.log(`   Creado: ${new Date(group.creationTime).toISOString()}`);
        }
        if (group.storedBytes) {
          console.log(`   Tamaño: ${(group.storedBytes / 1024 / 1024).toFixed(2)} MB`);
        }
      });
    } else {
      console.log('❌ No se encontraron log groups');
    }
    
  } catch (error) {
    console.error('❌ Error listando log groups:', error);
  }
}

// Manejar argumentos de línea de comandos
const command = process.argv[2];

switch (command) {
  case 'monitor':
    monitorLogs();
    break;
  case 'errors':
    searchErrors();
    break;
  case 'list':
    listLogGroups();
    break;
  case 'recent':
    getRecentLogs();
    break;
  default:
    console.log('📖 Uso del script:');
    console.log('  node monitor-logs.js recent   - Ver logs recientes');
    console.log('  node monitor-logs.js errors   - Buscar errores');
    console.log('  node monitor-logs.js monitor  - Monitoreo en tiempo real');
    console.log('  node monitor-logs.js list     - Listar log groups');
    break;
}