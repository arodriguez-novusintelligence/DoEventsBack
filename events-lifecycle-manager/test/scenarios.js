const dayjs = require('dayjs');

const today = dayjs().format('YYYYMMDD');
const threeDaysAgo = dayjs().subtract(3, 'day').format('YYYYMMDD');
const threeDaysAhead = dayjs().add(3, 'day').format('YYYYMMDD');

module.exports = {
  eventos: [
    {
      id: 'evt-001',
      nombre: 'Evento Hoy',
      fechaFin: today,
      fechaIni: today,
      email: 'organizador1@evento.com',
      estatus: 'inactivo'
    },
    {
      id: 'evt-002',
      nombre: 'Evento Próximo',
      fechaFin: threeDaysAhead,
      fechaIni: threeDaysAhead,
      email: 'organizador2@evento.com',
      estatus: 'inactivo'
    },
    {
      id: 'evt-003',
      nombre: 'Evento Pasado sin asistentes',
      fechaFin: threeDaysAgo,
      fechaIni: threeDaysAgo,
      email: 'organizador3@evento.com',
      estatus: 'en_ejecucion'
    },
    {
      id: 'evt-004',
      nombre: 'Evento Pasado con asistentes',
      fechaFin: threeDaysAgo,
      fechaIni: threeDaysAgo,
      email: 'organizador4@evento.com',
      estatus: 'en_ejecucion'
    }
  ],
  tickets: {
    'evt-004': [
      { status: 'CONFIRMED', email: 'asistente1@mail.com' },
      { status: 'CONFIRMED', email: 'asistente2@mail.com' }
    ],
    'evt-003': [] // sin emails confirmados
  }
};
