const AWS = require('aws-sdk');

const cloudWatchLogs = new AWS.CloudWatchLogs({
  region: 'us-east-1'
});

class LogMonitor {
  constructor() {
    this.monitoring = false;
    this.logGroups = [
      '/aws/lambda/aws-lambda-manageevent-dev-rescheduleEvent',
      '/aws/lambda/aws-lambda-manageevent-dev-cancelEvent'
    ];
    this.lastSeenTimestamp = {};
    
    // Inicializar timestamps
    this.logGroups.forEach(group => {
      this.lastSeenTimestamp[group] = Date.now() - (5 * 60 * 1000); // Últimos 5 minutos
    });
  }

  async getNewLogs() {
    for (const logGroupName of this.logGroups) {
      try {
        const result = await cloudWatchLogs.filterLogEvents({
          logGroupName: logGroupName,
          startTime: this.lastSeenTimestamp[logGroupName],
          limit: 100
        }).promise();

        if (result.events.length > 0) {
          console.log(`\n📋 [${new Date().toISOString()}] Nuevos logs en: ${logGroupName}`);
          console.log('='.repeat(80));
          
          result.events.forEach((event, index) => {
            const timestamp = new Date(event.timestamp).toISOString();
            console.log(`${index + 1}. [${timestamp}] ${event.message}`);
            
            // Buscar errores específicos
            if (event.message.includes('ERROR') || 
                event.message.includes('Error') || 
                event.message.includes('500') ||
                event.message.includes('timeout') ||
                event.message.includes('failed')) {
              console.log('🚨 ERROR DETECTADO 🚨');
            }
            
            // Buscar información importante
            if (event.message.includes('RESCHEDULE START') || 
                event.message.includes('CANCEL START') ||
                event.message.includes('Encontradas') ||
                event.message.includes('notificaciones')) {
              console.log('ℹ️  INFORMACIÓN IMPORTANTE');
            }
          });
          
          // Actualizar timestamp
          this.lastSeenTimestamp[logGroupName] = result.events[result.events.length - 1].timestamp + 1;
        }
        
      } catch (error) {
        if (error.code !== 'ResourceNotFoundException') {
          console.log(`❌ Error en ${logGroupName}: ${error.message}`);
        }
      }
    }
  }

  async startMonitoring() {
    this.monitoring = true;
    console.log('🎯 MONITOR DE LOGS INICIADO');
    console.log('📱 Ahora puedes probar la reprogramación/cancelación desde la app');
    console.log('👁️  Presiona Ctrl+C para detener');
    console.log('='.repeat(80));

    const interval = setInterval(async () => {
      if (!this.monitoring) {
        clearInterval(interval);
        return;
      }
      await this.getNewLogs();
    }, 3000); // Verificar cada 3 segundos

    // Manejar Ctrl+C
    process.on('SIGINT', () => {
      console.log('\n🛑 Deteniendo monitor...');
      this.monitoring = false;
      clearInterval(interval);
      process.exit(0);
    });

    // Obtener logs iniciales
    await this.getNewLogs();
  }

  async getRecentErrors() {
    console.log('🔍 Buscando errores recientes (últimos 30 minutos)...');
    
    const startTime = Date.now() - (30 * 60 * 1000);
    
    for (const logGroupName of this.logGroups) {
      try {
        console.log(`\n📋 Analizando: ${logGroupName.split('/').pop()}`);
        
        const result = await cloudWatchLogs.filterLogEvents({
          logGroupName: logGroupName,
          startTime: startTime,
          limit: 50
        }).promise();

        if (result.events.length > 0) {
          console.log(`📝 Total eventos: ${result.events.length}`);
          
          // Filtrar errores
          const errors = result.events.filter(event => 
            event.message.includes('ERROR') || 
            event.message.includes('Error') || 
            event.message.includes('500') ||
            event.message.includes('timeout') ||
            event.message.includes('failed') ||
            event.message.includes('exception')
          );
          
          if (errors.length > 0) {
            console.log(`❌ Errores encontrados: ${errors.length}`);
            errors.forEach((event, index) => {
              const timestamp = new Date(event.timestamp).toISOString();
              console.log(`  ${index + 1}. [${timestamp}] ${event.message}`);
            });
          } else {
            console.log('✅ No se encontraron errores');
          }
          
          // Mostrar últimos eventos para contexto
          console.log(`\n📄 Últimos 5 eventos:`);
          result.events.slice(-5).forEach((event, index) => {
            const timestamp = new Date(event.timestamp).toISOString();
            console.log(`  ${index + 1}. [${timestamp}] ${event.message}`);
          });
          
        } else {
          console.log('📝 No hay eventos recientes');
        }
        
      } catch (error) {
        if (error.code === 'ResourceNotFoundException') {
          console.log(`❌ Log group no encontrado: ${logGroupName}`);
        } else {
          console.log(`❌ Error: ${error.message}`);
        }
      }
    }
  }
}

// Uso del script
const command = process.argv[2];
const monitor = new LogMonitor();

switch (command) {
  case 'monitor':
    monitor.startMonitoring();
    break;
  case 'errors':
    monitor.getRecentErrors();
    break;
  default:
    console.log('📖 Uso del script:');
    console.log('');
    console.log('🎯 PARA MONITOREAR EN TIEMPO REAL:');
    console.log('  node real-time-logs.js monitor');
    console.log('');
    console.log('🔍 PARA VER ERRORES RECIENTES:');
    console.log('  node real-time-logs.js errors');
    console.log('');
    console.log('💡 Consejo: Ejecuta "monitor" y luego prueba la app para ver los logs en vivo');
    break;
}