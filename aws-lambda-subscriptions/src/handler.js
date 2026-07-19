const AWS = require('aws-sdk');
const { createWompiPaymentLink } = require('./wompi');
const { notifyProActivated } = require('./notifications');

const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.DYNAMODB_REGION || 'us-east-2',
});

const CLIENT_TABLE = process.env.CLIENT_TABLE || 'Client-qa';
const EVENTS_TABLE = process.env.EVENTS_TABLE || 'Eventos-qa';
const SUBSCRIPTIONS_TABLE = process.env.SUBSCRIPTIONS_TABLE || 'Subscriptions-qa';

const PRO_AMOUNT_USD = Number(process.env.PRO_AMOUNT_USD || 70);

const FREE_LIMITS = {
  eventsPerYear: 8,
  servicesPerYear: 2,
  placesPerYear: 2,
  ticketsPerEvent: 100,
};

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
  };
}

function yearStartIso() {
  const y = new Date().getFullYear();
  return `${y}-01-01T00:00:00.000Z`;
}

async function getClient(userId) {
  const result = await dynamodb.get({ TableName: CLIENT_TABLE, Key: { id: userId } }).promise();
  return result.Item || null;
}

async function countUserEvents(userId) {
  const result = await dynamodb.query({
    TableName: EVENTS_TABLE,
    IndexName: 'userIdIndex',
    KeyConditionExpression: 'userId = :uid',
    FilterExpression: 'createDate >= :yearStart',
    ExpressionAttributeValues: {
      ':uid': userId,
      ':yearStart': yearStartIso(),
    },
  }).promise();
  return (result.Items || []).length;
}

async function findSubscriptionByReference(reference) {
  const byIndex = await dynamodb.query({
    TableName: SUBSCRIPTIONS_TABLE,
    IndexName: 'ReferenceIndex',
    KeyConditionExpression: 'reference = :ref',
    ExpressionAttributeValues: { ':ref': reference },
    Limit: 1,
  }).promise().catch(() => ({ Items: [] }));

  if (byIndex.Items?.length) return byIndex.Items[0];

  const scan = await dynamodb.scan({
    TableName: SUBSCRIPTIONS_TABLE,
    FilterExpression: 'reference = :ref',
    ExpressionAttributeValues: { ':ref': reference },
    Limit: 1,
  }).promise();
  return scan.Items?.[0] || null;
}

async function activateProSubscription(userId, reference, transactionId) {
  const now = new Date().toISOString();
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const client = await getClient(userId);
  const sub = await dynamodb.get({ TableName: SUBSCRIPTIONS_TABLE, Key: { userId } }).promise();
  if (sub.Item?.status === 'ACTIVE') {
    return { alreadyActive: true, userId };
  }

  await dynamodb.update({
    TableName: CLIENT_TABLE,
    Key: { id: userId },
    UpdateExpression: 'SET #plan = :pro, proStartedAt = :now, proExpiresAt = :exp',
    ExpressionAttributeNames: { '#plan': 'plan' },
    ExpressionAttributeValues: {
      ':pro': 'pro',
      ':now': now,
      ':exp': expiresAt.toISOString(),
    },
  }).promise();

  await dynamodb.update({
    TableName: SUBSCRIPTIONS_TABLE,
    Key: { userId },
    UpdateExpression: 'SET #status = :active, startedAt = :now, transactionId = :tx, reference = :ref',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':active': 'ACTIVE',
      ':now': now,
      ':tx': transactionId || null,
      ':ref': reference,
    },
  }).promise();

  await notifyProActivated(userId, client?.email);
  return { activated: true, userId, expiresAt: expiresAt.toISOString() };
}

exports.getSubscriptionStatus = async (event) => {
  try {
    const userId = event.pathParameters?.userId;
    if (!userId) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ message: 'userId required' }) };
    }

    const client = await getClient(userId);
    const plan = String(client?.plan || 'free').toLowerCase() === 'pro' ? 'pro' : 'free';
    const rawRole = String(client?.platformRole || client?.role || 'user').toLowerCase();
    const platformRole = ['admin', 'support', 'operation'].includes(rawRole) ? rawRole : 'user';

    const subResult = await dynamodb.get({
      TableName: SUBSCRIPTIONS_TABLE,
      Key: { userId },
    }).promise().catch(() => ({ Item: null }));

    const eventsThisYear = await countUserEvents(userId);

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        plan: platformRole === 'admin' ? 'pro' : plan,
        platformRole,
        proExpiresAt: subResult.Item?.expiresAt || client?.proExpiresAt || null,
        proStartedAt: subResult.Item?.startedAt || client?.proStartedAt || null,
        usage: {
          eventsThisYear,
          servicesThisYear: Number(client?.servicesPublishedThisYear || 0),
          placesThisYear: Number(client?.placesPublishedThisYear || 0),
          publicationsThisMonth: Number(client?.publicationsThisMonth || 0),
        },
        limits: FREE_LIMITS,
      }),
    };
  } catch (error) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ message: error.message }) };
  }
};

exports.checkPublishLimit = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { userId, resource } = body;
    if (!userId || !resource) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ message: 'userId and resource required' }) };
    }

    const client = await getClient(userId);
    const platformRole = String(client?.platformRole || client?.role || 'user').toLowerCase();
    if (platformRole === 'admin') {
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ allowed: true, plan: 'pro' }) };
    }

    const plan = String(client?.plan || 'free').toLowerCase();
    if (plan === 'pro') {
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ allowed: true, plan: 'pro' }) };
    }

    let current = 0;
    let limit = 0;
    if (resource === 'event') {
      current = await countUserEvents(userId);
      limit = FREE_LIMITS.eventsPerYear;
    } else if (resource === 'service') {
      current = Number(client?.servicesPublishedThisYear || 0);
      limit = FREE_LIMITS.servicesPerYear;
    } else if (resource === 'place') {
      current = Number(client?.placesPublishedThisYear || 0);
      limit = FREE_LIMITS.placesPerYear;
    }

    const allowed = current < limit;
    return {
      statusCode: allowed ? 200 : 403,
      headers: corsHeaders(),
      body: JSON.stringify({
        allowed,
        plan: 'free',
        current,
        limit,
        reason: allowed ? null : `Límite del plan gratuito alcanzado (${current}/${limit})`,
      }),
    };
  } catch (error) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ message: error.message }) };
  }
};

exports.createProCheckout = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const userId = body.userId;
    if (!userId) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ message: 'userId required' }) };
    }

    const client = await getClient(userId);
    if (!client?.email) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ message: 'El usuario no tiene email registrado' }) };
    }

    const reference = `PRO-${userId}-${Date.now()}`;
    const now = new Date().toISOString();
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await dynamodb.put({
      TableName: SUBSCRIPTIONS_TABLE,
      Item: {
        userId,
        reference,
        status: 'PENDING',
        plan: 'pro',
        amountUsd: PRO_AMOUNT_USD,
        currency: 'USD',
        createdAt: now,
        startedAt: null,
        expiresAt: expiresAt.toISOString(),
      },
    }).promise();

    const wompi = await createWompiPaymentLink(
      PRO_AMOUNT_USD,
      reference,
      client.email,
      'USD',
      'DoEvents Plan PRO (anual)',
    );

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        reference,
        urlPaymentLink: wompi.urlPaymentLink,
      }),
    };
  } catch (error) {
    const isConfig = String(error.message || '').includes('WOMPI CREDENTIALS');
    return {
      statusCode: isConfig ? 503 : 500,
      headers: corsHeaders(),
      body: JSON.stringify({ message: error.message }),
    };
  }
};

exports.proPaymentWebhook = async (event) => {
  let payload;
  try {
    payload = event.body ? JSON.parse(event.body) : null;
  } catch (error) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ message: 'INVALID JSON' }) };
  }

  if (!payload?.data) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ message: 'INVALID WEBHOOK PAYLOAD' }) };
  }

  const transaction = payload.data.transaction || payload.data;
  const reference = transaction.reference;
  const status = String(transaction.status || '').toUpperCase();
  const transactionId = transaction.id;

  if (!reference || !String(reference).startsWith('PRO-')) {
    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ ok: true, skipped: true }) };
  }

  if (status !== 'APPROVED') {
    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ ok: true, status }) };
  }

  try {
    const sub = await findSubscriptionByReference(reference);
    if (!sub?.userId) {
      return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ message: 'Subscription not found' }) };
    }
    const result = await activateProSubscription(sub.userId, reference, transactionId);
    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ ok: true, ...result }) };
  } catch (error) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ message: error.message }) };
  }
};

exports.confirmProPayment = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const reference = body.reference || event.queryStringParameters?.reference;
    const transactionId = body.transactionId || event.queryStringParameters?.transaction_id;

    if (!reference) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ message: 'reference required' }) };
    }

    const sub = await findSubscriptionByReference(reference);
    if (!sub?.userId) {
      return { statusCode: 404, headers: corsHeaders(), body: JSON.stringify({ message: 'Suscripción no encontrada' }) };
    }

    if (sub.status === 'ACTIVE') {
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ ok: true, plan: 'pro', alreadyActive: true }) };
    }

    const wompiStatus = String(body.status || event.queryStringParameters?.status || '').toUpperCase();
    if (wompiStatus && wompiStatus !== 'APPROVED' && wompiStatus !== 'PAID') {
      return { statusCode: 402, headers: corsHeaders(), body: JSON.stringify({ message: 'Pago no aprobado' }) };
    }

    const result = await activateProSubscription(sub.userId, reference, transactionId);
    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ ok: true, plan: 'pro', ...result }) };
  } catch (error) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ message: error.message }) };
  }
};

exports.cancelPro = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const userId = body.userId;
    if (!userId) {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ message: 'userId required' }) };
    }

    await dynamodb.update({
      TableName: CLIENT_TABLE,
      Key: { id: userId },
      UpdateExpression: 'SET #plan = :free REMOVE proExpiresAt, proStartedAt',
      ExpressionAttributeNames: { '#plan': 'plan' },
      ExpressionAttributeValues: { ':free': 'free' },
    }).promise();

    await dynamodb.update({
      TableName: SUBSCRIPTIONS_TABLE,
      Key: { userId },
      UpdateExpression: 'SET #status = :cancelled, cancelledAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':cancelled': 'CANCELLED', ':now': new Date().toISOString() },
    }).promise().catch(() => undefined);

    return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ ok: true }) };
  } catch (error) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ message: error.message }) };
  }
};

module.exports.activateProSubscription = activateProSubscription;
