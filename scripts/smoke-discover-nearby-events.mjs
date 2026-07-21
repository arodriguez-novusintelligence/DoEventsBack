#!/usr/bin/env node
/**
 * Smoke test DEV: eventos cercanos vía eventsFeed (solo eventos).
 * Uso: node scripts/smoke-discover-nearby-events.mjs
 * Env opcional: EVENTS_FEED_URL, SMOKE_LAT, SMOKE_LNG, SMOKE_RADIUS_KM
 */
const DEFAULT_URL =
  process.env.EVENTS_FEED_URL ||
  "https://api-dev.doeventsapp.com/events-feed/eventsFeed";
const LAT = Number(process.env.SMOKE_LAT ?? 4.6097);
const LNG = Number(process.env.SMOKE_LNG ?? -74.0817);
const RADIUS_KM = Number(process.env.SMOKE_RADIUS_KM ?? 100);

function todayFormatted() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function requestNearby(payload) {
  const response = await fetch(DEFAULT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Respuesta no JSON (${response.status}): ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

function assertDistanceFilterApplied(data, label) {
  const items = Array.isArray(data.items) ? data.items : [];
  const debug = data.debug || {};
  if (!debug.hasLocation) {
    throw new Error(`${label}: se esperaba hasLocation=true`);
  }
  if (!debug.filtersApplied?.distance) {
    throw new Error(`${label}: se esperaba filtersApplied.distance=true`);
  }
  for (const item of items) {
    if (item.distancia == null || !Number.isFinite(Number(item.distancia))) {
      throw new Error(`${label}: item ${item.id} sin distancia numérica`);
    }
    if (item.score != null) {
      throw new Error(`${label}: item ${item.id} no debe incluir score en modo cercano`);
    }
    if (Number(item.distancia) > RADIUS_KM + 0.01) {
      throw new Error(
        `${label}: item ${item.id} fuera de radio (${item.distancia} km > ${RADIUS_KM})`,
      );
    }
  }
  console.log(
    `[OK] ${label}: total=${data.total ?? items.length} items=${items.length}`,
  );
}

async function main() {
  console.log(`Endpoint: ${DEFAULT_URL}`);
  console.log(`Coords: ${LAT}, ${LNG}`);
  console.log(`Radio: ${RADIUS_KM} km`);

  const basePayload = {
    userID: "",
    offset: 0,
    limit: 20,
    fechaActual: todayFormatted(),
    maxDistanceKm: RADIUS_KM,
  };

  const canonical = await requestNearby({
    ...basePayload,
    userLocation: { latitude: LAT, longitude: LNG },
  });
  assertDistanceFilterApplied(canonical, "latitude/longitude");

  const alias = await requestNearby({
    ...basePayload,
    userLocation: { lat: LAT, lng: LNG },
  });
  assertDistanceFilterApplied(alias, "lat/lng aliases");

  const unfiltered = await requestNearby({
    userID: "",
    offset: 0,
    limit: 5,
    fechaActual: todayFormatted(),
  });
  const unfilteredTotal = unfiltered.total ?? (unfiltered.items || []).length;
  const filteredTotal = canonical.total ?? (canonical.items || []).length;
  if (filteredTotal > unfilteredTotal) {
    throw new Error(
      `total filtrado (${filteredTotal}) > total sin filtro (${unfilteredTotal})`,
    );
  }

  console.log("smoke-discover-nearby-events.mjs: PASS");
}

main().catch((err) => {
  console.error("smoke-discover-nearby-events.mjs: FAIL");
  console.error(err.message || err);
  process.exit(1);
});
