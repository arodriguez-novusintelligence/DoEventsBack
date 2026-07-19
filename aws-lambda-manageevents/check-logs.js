const AWS = require('aws-sdk');

const cloudWatchLogs = new AWS.CloudWatchLogs({
  region: 'us-east-1'
});

async function searchErrorsSimple() {
  try {
    console.log('🔍 Buscando errores y logs recientes...');
    
    const logGroups = [
      '/aws/lambda/aws-lambda-manageevent-dev-rescheduleEvent',
      '/aws/lambda/aws-lambda-manageevent-dev-cancelEvent'
    ];
    
    for (const logGroupName of logGroups) {
      console.log(`\n📋 Analizando: ${logGroupName}`);
      
      try {
        // Obtener streams más recientes
        const streamsResult = await cloudWatchLogs.describeLogStreams({
          logGroupName: logGroupName,
          orderBy: 'LastEventTime',
          descending: true,
          limit: 5
        }).promise();
        
        if (streamsResult.logStreams.length === 0) {
          console.log('❌ No se encontraron log streams');
          continue;
        }
        
        console.log(`📄 Streams encontrados: ${streamsResult.logStreams.length}`);
        
        // Buscar errores en los streams más recientes
        for (const stream of streamsResult.logStreams.slice(0, 3)) {
          console.log(`\n🔍 Stream: ${stream.logStreamName}`);
          console.log(`⏰ Última actividad: ${new Date(stream.lastEventTime).toISOString()}`);
          
          // Obtener eventos con diferentes filtros
          const filters = [
            'ERROR',
            'Error',
            '500',
            'RESCHEDULE ERROR',
            'CANCEL ERROR',
            'Exception'
          ];
          
          for (const filter of filters) {
            try {
              const searchResult = await cloudWatchLogs.filterLogEvents({
                logGroupName: logGroupName,
                logStreamNames: [stream.logStreamName],
                startTime: Date.now() - (24 * 60 * 60 * 1000), // Últimas 24 horas
                filterPattern: filter
              }).promise();
              
              if (searchResult.events.length > 0) {
                console.log(`❌ Errores con filtro "${filter}" (${searchResult.events.length}):`);
                searchResult.events.forEach((event, index) => {
                  const timestamp = new Date(event.timestamp).toISOString();
                  console.log(`  ${index + 1}. [${timestamp}] ${event.message}`);
                });
              }
            } catch (filterError) {
              // Ignorar errores de filtro
            }
          }
          
          // También obtener los últimos eventos sin filtro
          try {
            const eventsResult = await cloudWatchLogs.getLogEvents({
              logGroupName: logGroupName,
              logStreamName: stream.logStreamName,
              startTime: Date.now() - (60 * 60 * 1000), // Última hora
              limit: 20
            }).promise();
            
            if (eventsResult.events.length > 0) {
              console.log(`📝 Últimos eventos (${eventsResult.events.length}):`);
              eventsResult.events.forEach((event, index) => {
                const timestamp = new Date(event.timestamp).toISOString();
                console.log(`  ${index + 1}. [${timestamp}] ${event.message}`);
              });
            }
          } catch (eventsError) {
            console.log(`❌ Error obteniendo eventos: ${eventsError.message}`);
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

// Función para obtener logs de un tiempo específico
async function getLogsFromTime(minutes = 60) {
  try {
    console.log(`🔍 Obteniendo logs de los últimos ${minutes} minutos...`);
    
    const logGroups = [
      '/aws/lambda/aws-lambda-manageevent-dev-rescheduleEvent',
      '/aws/lambda/aws-lambda-manageevent-dev-cancelEvent'
    ];
    
    const startTime = Date.now() - (minutes * 60 * 1000);
    
    for (const logGroupName of logGroups) {
      console.log(`\n📋 Logs de: ${logGroupName}`);
      
      try {
        const eventsResult = await cloudWatchLogs.filterLogEvents({
          logGroupName: logGroupName,
          startTime: startTime,
          limit: 100
        }).promise();
        
        if (eventsResult.events.length > 0) {
          console.log(`📝 Eventos encontrados (${eventsResult.events.length}):`);
          eventsResult.events.forEach((event, index) => {
            const timestamp = new Date(event.timestamp).toISOString();
            console.log(`${index + 1}. [${timestamp}] ${event.message}`);
          });
        } else {
          console.log('📝 No hay eventos en este período');
        }
        
      } catch (error) {
        if (error.code === 'ResourceNotFoundException') {
          console.log(`❌ Log group no encontrado: ${logGroupName}`);
        } else {
          console.log(`❌ Error: ${error.message}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

// Manejar argumentos de línea de comandos
const command = process.argv[2];
const param = process.argv[3];

switch (command) {
  case 'errors':
    searchErrorsSimple();
    break;
  case 'recent':
    const minutes = param ? parseInt(param) : 60;
    getLogsFromTime(minutes);
    break;
  default:
    console.log('📖 Uso del script:');
    console.log('  node check-logs.js errors          - Buscar errores');
    console.log('  node check-logs.js recent [min]    - Logs recientes (default: 60 min)');
    break;
}