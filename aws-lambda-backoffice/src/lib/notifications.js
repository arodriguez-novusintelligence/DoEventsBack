const axios = require('axios');

const NOTIFICATIONS_API = process.env.NOTIFICATIONS_API
  || 'https://api-qa.doeventsapp.com/notifications/trigger-notification';

async function triggerNotification(payload) {
  if (!NOTIFICATIONS_API) return;
  try {
    await axios.post(NOTIFICATIONS_API, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000,
    });
  } catch (err) {
    console.warn('triggerNotification failed:', err.response?.data || err.message);
  }
}

module.exports = { triggerNotification };
