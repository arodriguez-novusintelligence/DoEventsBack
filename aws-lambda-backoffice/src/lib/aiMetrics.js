const { doc } = require('./dynamo');

const TABLE = () => process.env.AI_INTERACTIONS_TABLE || 'AIInteractions-qa';

async function scanRecentInteractions(limit = 500) {
  const items = [];
  let lastKey;
  do {
    const page = await doc.scan({
      TableName: TABLE(),
      Limit: Math.min(100, limit - items.length),
      ExclusiveStartKey: lastKey,
    }).promise();
    items.push(...(page.Items || []));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey && items.length < limit);
  return items;
}

function dayKey(iso) {
  return String(iso || '').slice(0, 10);
}

async function buildAIMetrics() {
  const items = await scanRecentInteractions(800);
  const byDay = {};
  const byIntent = {};
  const byAgent = {};
  let emptyResults = 0;
  let total = items.length;

  items.forEach((item) => {
    const day = dayKey(item.createdAt);
    byDay[day] = (byDay[day] || 0) + 1;

    const intent = item.intent || 'unknown';
    byIntent[intent] = (byIntent[intent] || 0) + 1;

    (item.agents || []).forEach((agent) => {
      byAgent[agent] = (byAgent[agent] || 0) + 1;
    });

    const results = item.results || {};
    const counts = [
      results.events?.length,
      results.services?.length,
      results.venues?.length,
    ].filter((n) => typeof n === 'number');
    if (counts.length && counts.every((n) => n === 0)) emptyResults += 1;
  });

  const topIntents = Object.entries(byIntent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([intent, count]) => ({ intent, count }));

  const topAgents = Object.entries(byAgent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([agent, count]) => ({ agent, count }));

  const conversationsByDay = Object.entries(byDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([date, count]) => ({ date, count }));

  return {
    totalInteractions: total,
    emptyResultSearches: emptyResults,
    emptyResultRate: total ? Math.round((emptyResults / total) * 100) : 0,
    topIntents,
    topAgents,
    conversationsByDay,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { buildAIMetrics };
