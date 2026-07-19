const { eventos, tickets } = require('./scenarios');

exports.getAllEvents = async () => {
  console.log('🔍 Mock: obteniendo eventos...');
  return eventos;
};

exports.updateEventStatus = async (eventId, newStatus) => {
  console.log(`🛠 Mock: actualizando estado del evento ${eventId} a "${newStatus}"`);
};

exports.getConfirmedEmailsForEvent = async (eventId) => {
  console.log(`📩 Mock: obteniendo asistentes confirmados para ${eventId}`);
  return (tickets[eventId] || []).filter(t => t.status === 'CONFIRMED' && t.email).map(t => t.email);
};

exports.sendEmail = async (to, subject, body) => {
  console.log(`📤 Mock: enviando email a ${to}`);
  console.log(`➡️ Asunto: ${subject}`);
  console.log(`➡️ Cuerpo: ${body}\n`);
};
