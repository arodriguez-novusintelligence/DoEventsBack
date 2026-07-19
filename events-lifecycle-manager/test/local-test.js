const dayjs = require('dayjs');

// Sobreescribimos los utils reales con los mocks
const utils = require('./mock-utils');
const handler = async () => {
  const today = dayjs().startOf('day');
  const events = await utils.getAllEvents();

  for (const event of events) {
    const fechaFin = dayjs(event.fechaFin, 'YYYYMMDD');
    const diffDays = fechaFin.diff(today, 'day');

    if (diffDays === 0 && event.estatus !== 'en_ejecucion') {
      await utils.updateEventStatus(event.id, 'en_ejecucion');
    }

    if (diffDays < 0 && event.estatus !== 'finalizado') {
      await utils.updateEventStatus(event.id, 'finalizado');
    }

    if (diffDays === 3) {
      await utils.sendEmail(
        event.email,
        'Tu evento está por comenzar',
        `Faltan tres días para que inicie tu evento: ${event.nombre}`
      );
    }

    if (diffDays === -3) {
      const emails = await utils.getConfirmedEmailsForEvent(event.id);

      if (emails.length > 0) {
        for (const email of emails) {
          await utils.sendEmail(
            email,
            'Califica el evento',
            `Han pasado tres días desde el evento "${event.nombre}". Califícalo aquí: https://do.event/califica/${event.id}/${email}`
          );
        }
      } else {
        await utils.sendEmail(
          event.email,
          'Recordatorio para obtener calificaciones',
          `No se encontraron asistentes con email registrado para el evento "${event.nombre}". Puedes compartir este enlace para recibir calificaciones: https://do.event/califica/${event.id}/organizador`
        );
      }
    }
  }
};

handler()
  .then(() => console.log('✅ Simulación completada\n'))
  .catch(err => console.error('❌ Error:', err));
