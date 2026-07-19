/**
 * Test para validar los campos FAQ y EventDays
 * Este archivo prueba la creación y actualización de eventos con los nuevos campos
 */

const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

// Configurar AWS SDK
AWS.config.update({ region: "us-east-1" });

// Importar funciones
const { createEvent } = require("./src/createEvent");
const { updateEvent } = require("./src/updateEvent");

// Colores para la consola
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[36m",
};

const log = {
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
};

// Datos de prueba
const testData = {
  // Evento básico
  basicEvent: {
    nombre: "Evento Test FAQ y EventDays",
    descripcion: "Evento de prueba para validar nuevos campos",
    fechaIni: "25/12/2024",
    fechaFin: "26/12/2024",
    horaIni: "09:00",
    horaFin: "18:00",
    userId: "test-user-123",
    organizerName: "Organizador Test",
    email: "test@example.com",
    TelPrin: "1234567890",
    tipoEvento: "Conferencia",
    Categoria: "Tecnología",
    aforo: 500,
    modalidadEvt: "public",
    pais: "Colombia",
    ciudad: "Bogotá",
    direccion: "Calle Test 123",
    departamento: "Cundinamarca",
    clase: "premium",
  },

  // FAQ de prueba
  faq: [
    {
      question: "¿Cuál es el horario del evento?",
      answer: "El evento será de 9:00 AM a 6:00 PM",
    },
    {
      question: "¿Hay estacionamiento?",
      answer: "Sí, hay estacionamiento gratuito disponible",
    },
    {
      question: "¿Se entrega certificado?",
      answer: "Sí, se entrega certificado de participación",
    },
  ],

  // EventDays de prueba
  eventDays: [
    {
      id: uuidv4(),
      dayName: "Día 1 - Conferencias",
      date: "2024-12-25T00:00:00.000Z",
      activities: [
        {
          id: uuidv4(),
          startTime: "2024-12-25T09:00:00.000Z",
          endTime: "2024-12-25T10:30:00.000Z",
          startTimeDisplay: "09:00 A.M",
          endTimeDisplay: "10:30 A.M",
          description: "Registro y bienvenida",
          responsible: {
            id: "user-456",
            nombre: "Juan",
            apellido: "Pérez",
            email: "juan.perez@example.com",
            username: "juanperez",
            displayName: "Juan Pérez",
          },
        },
        {
          id: uuidv4(),
          startTime: "2024-12-25T11:00:00.000Z",
          endTime: "2024-12-25T12:30:00.000Z",
          startTimeDisplay: "11:00 A.M",
          endTimeDisplay: "12:30 P.M",
          description: "Conferencia principal: El futuro de la IA",
          responsible: "María González",
        },
        {
          id: uuidv4(),
          startTime: "2024-12-25T14:00:00.000Z",
          endTime: "2024-12-25T16:00:00.000Z",
          startTimeDisplay: "02:00 P.M",
          endTimeDisplay: "04:00 P.M",
          description: "Panel: Tendencias en desarrollo web",
          responsible: null,
        },
      ],
    },
    {
      id: uuidv4(),
      dayName: "Día 2 - Talleres",
      date: "2024-12-26T00:00:00.000Z",
      activities: [
        {
          id: uuidv4(),
          startTime: "2024-12-26T09:00:00.000Z",
          endTime: "2024-12-26T11:00:00.000Z",
          startTimeDisplay: "09:00 A.M",
          endTimeDisplay: "11:00 A.M",
          description: "Workshop: Introducción a React",
          responsible: {
            id: "user-789",
            nombre: "Carlos",
            apellido: "Rodríguez",
            email: "carlos.rodriguez@example.com",
            username: "carlosr",
            displayName: "Carlos Rodríguez",
          },
        },
        {
          id: uuidv4(),
          startTime: "2024-12-26T14:00:00.000Z",
          endTime: "2024-12-26T15:30:00.000Z",
          startTimeDisplay: "02:00 P.M",
          endTimeDisplay: "03:30 P.M",
          description: "Taller práctico: Desarrollo de APIs",
          responsible: "Ana Martínez",
        },
      ],
    },
  ],
};

/**
 * Test 1: Crear evento con FAQ y EventDays
 */
async function testCreateEventWithFaqAndEventDays() {
  log.info("Test 1: Crear evento con FAQ y EventDays");

  const eventBody = {
    ...testData.basicEvent,
    faq: testData.faq,
    eventDays: testData.eventDays,
  };

  const mockEvent = {
    body: JSON.stringify(eventBody),
  };

  try {
    const response = await createEvent(mockEvent);
    const result = JSON.parse(response.body);

    if (response.statusCode === 201 && result.success) {
      log.success("Evento creado exitosamente");
      log.info(`Event ID: ${result.data.id}`);
      return result.data.id;
    } else {
      log.error("Error al crear evento");
      console.log(response);
      return null;
    }
  } catch (error) {
    log.error(`Error en test: ${error.message}`);
    console.error(error);
    return null;
  }
}

/**
 * Test 2: Crear evento solo con FAQ
 */
async function testCreateEventWithFaqOnly() {
  log.info("\nTest 2: Crear evento solo con FAQ");

  const eventBody = {
    ...testData.basicEvent,
    nombre: "Evento Test Solo FAQ",
    faq: testData.faq,
  };

  const mockEvent = {
    body: JSON.stringify(eventBody),
  };

  try {
    const response = await createEvent(mockEvent);
    const result = JSON.parse(response.body);

    if (response.statusCode === 201 && result.success) {
      log.success("Evento con FAQ creado exitosamente");
      log.info(`Event ID: ${result.data.id}`);
      return result.data.id;
    } else {
      log.error("Error al crear evento");
      console.log(response);
      return null;
    }
  } catch (error) {
    log.error(`Error en test: ${error.message}`);
    console.error(error);
    return null;
  }
}

/**
 * Test 3: Crear evento solo con EventDays
 */
async function testCreateEventWithEventDaysOnly() {
  log.info("\nTest 3: Crear evento solo con EventDays");

  const eventBody = {
    ...testData.basicEvent,
    nombre: "Evento Test Solo EventDays",
    eventDays: testData.eventDays,
  };

  const mockEvent = {
    body: JSON.stringify(eventBody),
  };

  try {
    const response = await createEvent(mockEvent);
    const result = JSON.parse(response.body);

    if (response.statusCode === 201 && result.success) {
      log.success("Evento con EventDays creado exitosamente");
      log.info(`Event ID: ${result.data.id}`);
      return result.data.id;
    } else {
      log.error("Error al crear evento");
      console.log(response);
      return null;
    }
  } catch (error) {
    log.error(`Error en test: ${error.message}`);
    console.error(error);
    return null;
  }
}

/**
 * Test 4: Crear evento sin FAQ ni EventDays
 */
async function testCreateEventBasic() {
  log.info("\nTest 4: Crear evento básico (sin FAQ ni EventDays)");

  const mockEvent = {
    body: JSON.stringify(testData.basicEvent),
  };

  try {
    const response = await createEvent(mockEvent);
    const result = JSON.parse(response.body);

    if (response.statusCode === 201 && result.success) {
      log.success("Evento básico creado exitosamente");
      log.info(`Event ID: ${result.data.id}`);
      return result.data.id;
    } else {
      log.error("Error al crear evento");
      console.log(response);
      return null;
    }
  } catch (error) {
    log.error(`Error en test: ${error.message}`);
    console.error(error);
    return null;
  }
}

/**
 * Test 5: Actualizar evento agregando FAQ
 */
async function testUpdateEventAddFaq(eventId) {
  log.info("\nTest 5: Actualizar evento agregando FAQ");

  if (!eventId) {
    log.warn("No hay eventId para actualizar");
    return;
  }

  const updatedFaq = [
    ...testData.faq,
    {
      question: "¿Puedo llevar acompañante?",
      answer: "Sí, cada entrada admite un acompañante",
    },
  ];

  const mockEvent = {
    pathParameters: { id: eventId },
    body: JSON.stringify({
      faq: updatedFaq,
    }),
  };

  try {
    const response = await updateEvent(mockEvent);
    const result = JSON.parse(response.body);

    if (response.statusCode === 200 && result.success) {
      log.success("FAQ actualizado exitosamente");
      log.info(`Nuevas FAQs: ${updatedFaq.length}`);
    } else {
      log.error("Error al actualizar FAQ");
      console.log(response);
    }
  } catch (error) {
    log.error(`Error en test: ${error.message}`);
    console.error(error);
  }
}

/**
 * Test 6: Actualizar evento agregando EventDays
 */
async function testUpdateEventAddEventDays(eventId) {
  log.info("\nTest 6: Actualizar evento agregando EventDays");

  if (!eventId) {
    log.warn("No hay eventId para actualizar");
    return;
  }

  const mockEvent = {
    pathParameters: { id: eventId },
    body: JSON.stringify({
      eventDays: testData.eventDays,
    }),
  };

  try {
    const response = await updateEvent(mockEvent);
    const result = JSON.parse(response.body);

    if (response.statusCode === 200 && result.success) {
      log.success("EventDays actualizado exitosamente");
      log.info(`Días agregados: ${testData.eventDays.length}`);
    } else {
      log.error("Error al actualizar EventDays");
      console.log(response);
    }
  } catch (error) {
    log.error(`Error en test: ${error.message}`);
    console.error(error);
  }
}

/**
 * Ejecutar todos los tests
 */
async function runAllTests() {
  console.log("\n" + "=".repeat(60));
  log.info("Iniciando pruebas de FAQ y EventDays");
  console.log("=".repeat(60) + "\n");

  try {
    // Test 1: Crear evento completo
    const eventId1 = await testCreateEventWithFaqAndEventDays();

    // Test 2: Crear evento solo con FAQ
    const eventId2 = await testCreateEventWithFaqOnly();

    // Test 3: Crear evento solo con EventDays
    const eventId3 = await testCreateEventWithEventDaysOnly();

    // Test 4: Crear evento básico
    const eventId4 = await testCreateEventBasic();

    // Test 5: Actualizar evento básico agregando FAQ
    if (eventId4) {
      await testUpdateEventAddFaq(eventId4);
    }

    // Test 6: Actualizar evento básico agregando EventDays
    if (eventId4) {
      await testUpdateEventAddEventDays(eventId4);
    }

    console.log("\n" + "=".repeat(60));
    log.success("Pruebas completadas");
    console.log("=".repeat(60) + "\n");

    log.info("IDs de eventos creados:");
    if (eventId1) log.info(`- Evento completo: ${eventId1}`);
    if (eventId2) log.info(`- Evento con FAQ: ${eventId2}`);
    if (eventId3) log.info(`- Evento con EventDays: ${eventId3}`);
    if (eventId4) log.info(`- Evento básico: ${eventId4}`);
  } catch (error) {
    log.error(`Error general en las pruebas: ${error.message}`);
    console.error(error);
  }
}

// Ejecutar tests si se ejecuta directamente
if (require.main === module) {
  runAllTests();
}

module.exports = {
  testCreateEventWithFaqAndEventDays,
  testCreateEventWithFaqOnly,
  testCreateEventWithEventDaysOnly,
  testCreateEventBasic,
  testUpdateEventAddFaq,
  testUpdateEventAddEventDays,
  runAllTests,
};
