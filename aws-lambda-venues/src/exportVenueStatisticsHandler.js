const { respond, handleOptions } = require("./venueSocialUtils");
const {
  parseAuthUserId,
  assertVenueOwnerAccess,
  loadVenueBookingsForStatsGroup,
  buildExportRows,
} = require("./venueStatsShared");
const { dynamodb, venueTable } = require("./dynamoClient");

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
    const venueId = event.pathParameters?.venueId;
    const userId = parseAuthUserId(event);
    if (!venueId) {
      return respond(400, { error: "venueId es requerido" });
    }
    await assertVenueOwnerAccess(venueId, userId);

    const venueResult = await dynamodb
      .get({ TableName: venueTable(), Key: { venue_id: venueId } })
      .promise();
    if (!venueResult.Item) {
      return respond(404, { error: "Lugar no encontrado" });
    }

    const bookings = await loadVenueBookingsForStatsGroup(venueId, userId);
    const rows = buildExportRows(bookings);
    const venueName = String(venueResult.Item.name || "lugar").replace(/\s+/g, "_");
    const today = new Date().toISOString().slice(0, 10);
    const filename = `ingresos_${venueName}_${today}.csv`;

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
    console.error("exportVenueStatisticsHandler error:", error);
    const status = error.statusCode || 500;
    return respond(status, { error: error.message || "Error interno" });
  }
};
