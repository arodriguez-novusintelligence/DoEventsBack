const { handleOptions } = require("./response");
const {
  parseAuthUserId,
  assertServiceOwnerAccess,
  loadServiceBookings,
  buildExportRows,
} = require("./serviceStatsShared");
const { dynamodb } = require("./servicePromoCodesShared");

const SERVICES_TABLE = process.env.SERVICES_TABLE || "ServiceProviders-dev";

function toCsv(rows) {
  const header = [
    "Fecha pago",
    "Cliente",
    "Reservas pagadas",
    "Ingreso bruto",
    "Comision plataforma",
    "Ingreso neto propietario",
    "Moneda",
    "Detalle fechas de pago",
  ];
  const lines = [header.join(",")];
  rows.forEach((row) => {
    lines.push([
      row.paidAt,
      `"${String(row.guestName).replace(/"/g, '""')}"`,
      row.nights,
      row.gross,
      row.commission,
      row.net,
      row.currency,
      `"${String(row.detail).replace(/"/g, '""')}"`,
    ].join(","));
  });
  return lines.join("\n");
}

exports.handler = async (event) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  try {
    const serviceId = event.pathParameters?.serviceId;
    const userId = parseAuthUserId(event);
    if (!serviceId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "serviceId es requerido" }),
      };
    }
    await assertServiceOwnerAccess(serviceId, userId);

    const serviceResult = await dynamodb
      .get({ TableName: SERVICES_TABLE, Key: { serviceId } })
      .promise();
    if (!serviceResult.Item) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Servicio no encontrado" }),
      };
    }

    const bookings = await loadServiceBookings(serviceId);
    const rows = buildExportRows(bookings);
    const serviceName = String(
      serviceResult.Item.businessName || serviceResult.Item.name || "servicio",
    ).replace(/\s+/g, "_");
    const today = new Date().toISOString().slice(0, 10);
    const filename = `ingresos_${serviceName}_${today}.csv`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Expose-Headers": "Content-Disposition",
      },
      body: `\uFEFF${toCsv(rows)}`,
    };
  } catch (error) {
    console.error("exportServiceStatisticsHandler error:", error);
    const status = error.statusCode || 500;
    return {
      statusCode: status,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: error.message || "Error interno" }),
    };
  }
};
