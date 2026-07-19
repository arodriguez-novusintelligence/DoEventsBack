const AWS = require('aws-sdk');
const { withCors, handlePreflight } = require('./cors-web');

const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.getPreferences = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  try {
    const result = await dynamodb
      .scan({
        TableName: process.env.PREFERENCES_TABLE || 'Preferences-qa',
      })
      .promise();

    const items = (result.Items || [])
      .filter((item) => item.preference_status !== false)
      .map((item) => ({
        preference_id: Number(item.preference_id),
        preference_name_en: item.preference_name_en || '',
        preference_name_es: item.preference_name_es || '',
        preference_status: item.preference_status !== false,
        preference_description: item.preference_description || '',
      }))
      .sort((a, b) => a.preference_id - b.preference_id);

    return withCors(event, {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: items }),
    });
  } catch (error) {
    return withCors(event, {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: error.message }),
    });
  }
};

exports.saveUserPreferences = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
    const userId = body.userId;
    const preferences = Array.isArray(body.preferences) ? body.preferences : [];

    if (!userId) {
      return withCors(event, {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'userId es requerido' }),
      });
    }

    if (preferences.length === 0) {
      return withCors(event, {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Debe seleccionar al menos una preferencia' }),
      });
    }

    const now = new Date().toISOString();
    await dynamodb
      .put({
        TableName: process.env.USER_PREFERENCES_TABLE || 'UserPreferences-qa',
        Item: {
          UserId: userId,
          Preferences: preferences.map((id) => Number(id)),
          createdAt: now,
          updatedAt: now,
        },
      })
      .promise();

    return withCors(event, {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Preferencias guardadas correctamente' }),
    });
  } catch (error) {
    return withCors(event, {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: error.message }),
    });
  }
};
