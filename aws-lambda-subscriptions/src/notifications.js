const axios = require('axios');

const NOTIFICATIONS_API = process.env.NOTIFICATIONS_API
  || 'https://api-qa.doeventsapp.com/notifications/trigger-notification';

async function notifyProActivated(userId, email) {
  if (!NOTIFICATIONS_API) return;
  try {
    await axios.post(NOTIFICATIONS_API, {
      templateKey: 'ADMIN_ACTIVITY_ALERT',
      metadata: {
        userId,
        activityType: 'PRO_SUBSCRIPTION_ACTIVATED',
        description: `Plan PRO activado para ${email || userId}`,
      },
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 8000 });
  } catch (err) {
    console.warn('notifyProActivated failed:', err.message);
  }
}

module.exports = { notifyProActivated };
