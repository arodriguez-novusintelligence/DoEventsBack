// DEPENDENCIES: HTTP CLIENT AND AWS SDK
const axios = require("axios");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

// DYNAMODB DOCUMENT CLIENT TO QUERY TABLES (E.G. TICKETS, ORDERS)
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.DYNAMODB_REGION || process.env.AWS_REGION || "us-east-1",
}));
const ORDERS_TABLE = process.env.ORDERS_TABLE || "Orders-dev";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

// -----------------------------------------------------------------------------
// HELPER: EXTRACT AND NORMALIZE ALL BOLETAS FROM TICKET ITEMS (MULTIPLE FLOORS/CATEGORIES)
// Each DynamoDB item may have "boleta" (single object) or "boletas" (array). Merge all into one array.
// -----------------------------------------------------------------------------
const getAllBoletasFromItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) return [];
  const all = [];
  for (const item of items) {
    const raw = item.boleta ?? item.boletas;
    if (Array.isArray(raw)) {
      all.push(...raw);
    } else if (raw != null && typeof raw === "object") {
      all.push(raw);
    }
  }
  return all;
};

// -----------------------------------------------------------------------------
// FEE FORMULA (SINGLE SOURCE OF TRUTH): 8% service + 1500 COP fixed + 19% IVA on (service + 1500).
// Applied per ticket/seat. Returns integer COP so client and backend stay aligned.
// -----------------------------------------------------------------------------
const applyFeesToUnitPrice = (unitPriceCop) => {
  const taxService = Number(unitPriceCop) * 0.08;
  const taxIva = (taxService + 1500) * 0.19;
  const totalWithFees = unitPriceCop + taxService + 1500 + taxIva;
  return Math.round(totalWithFees);
};

// -----------------------------------------------------------------------------
// HELPER: NORMALIZE PRICE + COST FLAGS TO DECIDE IF A TICKET IS FREE
// A ticket is free only when BOTH conditions are met from DB source-of-truth:
//   - costo === false
//   - valor/precio/price === 0
// Any inconsistent combination is rejected as invalid configuration.
// -----------------------------------------------------------------------------
const getTicketPriceAndCostInfo = (boleta, ticketIdLabel) => {
  let ticketPrice = null;
  if (boleta.valor !== undefined && boleta.valor !== null) {
    ticketPrice = Number(boleta.valor);
  } else if (boleta.Valor !== undefined && boleta.Valor !== null) {
    ticketPrice = Number(boleta.Valor);
  } else if (boleta.precio !== undefined && boleta.precio !== null) {
    ticketPrice = Number(boleta.precio);
  } else if (boleta.Precio !== undefined && boleta.Precio !== null) {
    ticketPrice = Number(boleta.Precio);
  } else if (boleta.price !== undefined && boleta.price !== null) {
    ticketPrice = Number(boleta.price);
  }

  if (ticketPrice === null || Number.isNaN(ticketPrice) || ticketPrice < 0) {
    const availableFields = Object.keys(boleta).join(", ");
    throw new Error(
      `INVALID PRICE FOR TICKET ${ticketIdLabel}. ` +
      `Price fields (valor/Valor/precio/Precio/price) not found or invalid. ` +
      `Available fields: ${availableFields}`
    );
  }

  const rawCostFlag = boleta.costo ?? boleta.Costo;
  const hasCost = rawCostFlag === undefined || rawCostFlag === null
    ? true
    : !(rawCostFlag === false || String(rawCostFlag).toLowerCase() === "false");
  const isFreeTicket = !hasCost && ticketPrice === 0;

  if (!hasCost && ticketPrice > 0) {
    throw new Error(
      `INCONSISTENT TICKET CONFIGURATION FOR ${ticketIdLabel}: costo=false REQUIRES valor=0`
    );
  }
  if (hasCost && ticketPrice === 0) {
    throw new Error(
      `INCONSISTENT TICKET CONFIGURATION FOR ${ticketIdLabel}: valor=0 REQUIRES costo=false`
    );
  }

  return {
    ticketPrice,
    hasCost,
    isFreeTicket,
  };
};

// Exposed for tests and for frontend alignment (see docs/PAYMENT_LINK_CALCULATION.md)
exports.applyFeesToUnitPrice = applyFeesToUnitPrice;

const isVenueRentalRequest = (req = {}) => {
  const metadata = req.metadata || {};
  const orderType = metadata.orderType || req.orderType;
  return (
    orderType === "VENUE_RENTAL" ||
    (req.reference && String(req.reference).startsWith("VEN-"))
  );
};

const isServiceRentalRequest = (req = {}) => {
  const metadata = req.metadata || {};
  const orderType = metadata.orderType || req.orderType;
  return (
    orderType === "SERVICE_RENTAL" ||
    (req.reference && String(req.reference).startsWith("SVC-"))
  );
};

const isRentalRequest = (req = {}) =>
  isVenueRentalRequest(req) || isServiceRentalRequest(req);

const isVenueRentalOrder = (order = {}) =>
  order.order_type === "VENUE_RENTAL" ||
  order.metadata?.orderType === "VENUE_RENTAL";

const isServiceRentalOrder = (order = {}) =>
  order.order_type === "SERVICE_RENTAL" ||
  order.metadata?.orderType === "SERVICE_RENTAL";

const isRentalOrder = (order = {}) =>
  isVenueRentalOrder(order) || isServiceRentalOrder(order);

// -----------------------------------------------------------------------------
// RECALCULATE RENTAL COSTS FROM ORDERS TABLE (VENUE OR SERVICE — SOURCE OF TRUTH)
// -----------------------------------------------------------------------------
const recalculateRentalFromOrder = async (reference) => {
  if (!reference || typeof reference !== "string") {
    throw new Error("INVALID ORDER REFERENCE");
  }

  const result = await dynamodb.send(
    new GetCommand({
      TableName: ORDERS_TABLE,
      Key: { order_id: reference },
    })
  );

  const order = result.Item;
  if (!order) {
    throw new Error(`ORDER NOT FOUND: ${reference}`);
  }
  if (!isRentalOrder(order)) {
    throw new Error("ORDER IS NOT A RENTAL ORDER");
  }

  const paymentStatus = String(order.payment_status || order.status || "").toUpperCase();
  if (paymentStatus === "PAID" || paymentStatus === "APPROVED") {
    throw new Error("ORDER ALREADY PAID");
  }

  const expiredAt = Number(order.expired_at_ts || 0);
  if (expiredAt && expiredAt < Date.now()) {
    throw new Error("ORDER EXPIRED");
  }

  const total = Number(order.total_amount);
  if (!Number.isFinite(total) || total < 0) {
    throw new Error("INVALID ORDER TOTAL");
  }

  return {
    total,
    isFreeCheckout: total === 0,
    breakdown: [],
    order,
  };
};

const recalculateVenueRentalFromOrder = recalculateRentalFromOrder;

exports.recalculateVenueRentalFromOrder = recalculateVenueRentalFromOrder;
exports.recalculateRentalFromOrder = recalculateRentalFromOrder;

// -----------------------------------------------------------------------------
// HELPER: FORMAT WOMPI API ERROR FOR CLIENT
// -----------------------------------------------------------------------------
const formatWompiError = (error) => {
  const data = error?.response?.data;
  if (!data) return error?.message || "UNKNOWN WOMPI ERROR";
  if (typeof data === "string") return data;
  const wompiError = data.error || data;
  if (wompiError?.messages && typeof wompiError.messages === "object") {
    const parts = Object.entries(wompiError.messages).flatMap(([field, msgs]) => {
      if (Array.isArray(msgs)) return msgs.map((m) => `${field}: ${m}`);
      return [`${field}: ${String(msgs)}`];
    });
    if (parts.length) return parts.join("; ");
  }
  if (wompiError?.reason) return String(wompiError.reason);
  try {
    return JSON.stringify(wompiError);
  } catch {
    return error?.message || "UNKNOWN WOMPI ERROR";
  }
};

// -----------------------------------------------------------------------------
// HELPER: CREATE WOMPI PAYMENT LINK
// CALLS WOMPI API TO GENERATE A CHECKOUT URL; RETURNS URL AND PAYMENT LINK DATA
// -----------------------------------------------------------------------------
const createWompiPaymentLink = async (amount, reference, customerEmail, currency, description) => {
  // LOAD WOMPI ENV VARS (PRIVATE KEY, REDIRECT URL, WEBHOOK URL)
  const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY;
  const WOMPI_REDIRECT_BASE_URL = process.env.WOMPI_REDIRECT_BASE_URL;
  const WOMPI_API_BASE_URL = process.env.WOMPI_API_BASE_URL || "https://sandbox.wompi.co/v1";

  // ENSURE CREDENTIALS EXIST BEFORE CALLING API
  if (!WOMPI_PRIVATE_KEY || !WOMPI_REDIRECT_BASE_URL) {
    throw new Error("SERVER CONFIGURATION ERROR: WOMPI CREDENTIALS MISSING");
  }

  // WOMPI EXPECTS amount_in_cents: LAST TWO DIGITS = CENTS (E.G. 606900 COP -> 60690000 CENTS)
  const amountInCents = currency === "COP" ? Math.round(Number(amount) * 100) : Math.round(Number(amount));
  const redirectSeparator = WOMPI_REDIRECT_BASE_URL.includes("?") ? "&" : "?";
  const redirectUrl = `${WOMPI_REDIRECT_BASE_URL}${redirectSeparator}reference=${encodeURIComponent(reference)}`;

  const safeDescription = String(description || `Pago orden ${reference}`).slice(0, 120);
  const safeName = safeDescription.slice(0, 80) || "Pago DoEvents";

  // Payload alineado con API oficial /v1/payment_links (sin reference ni webhook_url)
  const paymentLinkData = {
    name: safeName,
    description: safeDescription,
    single_use: true,
    collect_shipping: false,
    amount_in_cents: amountInCents,
    currency: currency || "COP",
    redirect_url: redirectUrl,
  };

  const sku = String(reference || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 36);
  if (sku) paymentLinkData.sku = sku;
  // Wompi devuelve sku como transaction.reference en webhook; guardamos order_id completo en redirect_url

  void customerEmail;

  // POST TO WOMPI SANDBOX TO CREATE PAYMENT LINK
  const response = await axios.post(
    `${WOMPI_API_BASE_URL}/payment_links`,
    paymentLinkData,
    {
      headers: {
        Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  // VALIDATE RESPONSE CONTAINS PAYMENT LINK ID
  if (!response.data.data || !response.data.data.id) {
    throw new Error("MISSING PAYMENT LINK ID IN WOMPI RESPONSE");
  }

  // RETURN CHECKOUT URL AND RAW PAYMENT LINK DATA
  return {
    urlPaymentLink: `https://checkout.wompi.co/l/${response.data.data.id}`,
    paymentLinkData: response.data.data
  };
};

// -----------------------------------------------------------------------------
// LAMBDA HANDLER: CREATE PAYMENT LINK
// Amount is always recalculated from DB (Tickets table by eventId). Request body "amount" is optional (audit only).
// See docs/PAYMENT_LINK_CALCULATION.md for price source, fee formula, rounding, and strategy (Option A).
// -----------------------------------------------------------------------------
exports.createPaymentLink = async (event) => {
  // CHECK WOMPI ENV VARS ARE SET
  const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY;
  const WOMPI_REDIRECT_BASE_URL = process.env.WOMPI_REDIRECT_BASE_URL;

  // PARSE REQUEST BODY AS JSON
  let req;
  try {
    req = event.body ? JSON.parse(event.body) : null;
  } catch (parseError) {
    return jsonResponse(400, {
      message: "INVALID JSON FORMAT IN REQUEST BODY.",
      details: parseError.message,
    });
  }

  // REJECT IF BODY IS MISSING OR EMPTY
  if (!req) {
    return jsonResponse(400, { message: "INVALID REQUEST BODY. EXPECTED JSON." });
  }

  // NORMALIZE FIELDS: ACCEPT event_id OR eventId, customer_email OR customerEmail, hasSeating FROM BODY OR metadata
  const eventId = req.event_id || req.eventId;
  const customerEmail = req.customer_email || req.customerEmail;
  const hasSeating = req.hasSeating === true || req.hasSeating === "true" ||
    (req.metadata && (req.metadata.hasSeating === true || req.metadata.hasSeating === "true"));
  const isRentalOrderRequest = isRentalRequest(req);

  // VALIDATE REQUIRED FIELDS (amount is optional; backend recalculates)
  if (!req.currency || !req.reference || !customerEmail) {
    return jsonResponse(400, {
      message: "MISSING REQUIRED FIELDS: CURRENCY, REFERENCE, CUSTOMER_EMAIL.",
    });
  }

  if (!isRentalOrderRequest && !eventId) {
    return jsonResponse(400, {
      message: "MISSING REQUIRED FIELD: EVENT_ID.",
    });
  }

  // If amount is sent, it is for logging/audit only; it must be non-negative when present
  if (req.amount != null && (typeof req.amount !== 'number' || req.amount < 0)) {
    return jsonResponse(400, {
      message: "WHEN PROVIDED, AMOUNT MUST BE A NON-NEGATIVE NUMBER.",
    });
  }

  // BUILD tickets FROM categoriesAndSeats WHEN SEATING AND NO tickets PROVIDED (ticket orders only)
  if (!isRentalOrderRequest && hasSeating && req.categoriesAndSeats && Array.isArray(req.categoriesAndSeats) && req.categoriesAndSeats.length > 0) {
    
    // IF NO tickets PROVIDED, BUILD FROM categoriesAndSeats
    if (!req.tickets || !Array.isArray(req.tickets) || req.tickets.length === 0) {

      req.tickets = [];
      for (const cat of req.categoriesAndSeats) {
        const categoryId = cat.categoryId;
        const category = cat.category;
        const seats = cat.selectedSeats || [];
        for (const seat of seats) {
          req.tickets.push({
            ticketsDistId: categoryId,
            category: category,
            location: {
              row: seat.rowLabel ?? seat.row,
              number: seat.colNumber ?? seat.number,
              seatLabel: seat.seatCode ?? seat.seatLabel,
            },
          });
        }
      }
    }
  }

  // TICKETS ARRAY IS REQUIRED FOR TICKET ORDERS (WITH OR WITHOUT SEATING)
  if (!isRentalOrderRequest && (!req.tickets || !Array.isArray(req.tickets) || req.tickets.length === 0)) {
    return jsonResponse(400, {
      message: "TICKETS ARRAY IS REQUIRED AND MUST NOT BE EMPTY. Provide 'tickets' or, for seating, 'categoriesAndSeats' with selectedSeats.",
    });
  }

  // RECALCULATE TOTAL FROM DATABASE (SINGLE SOURCE OF TRUTH — OPTION A)
  // The amount in the request body is ignored for the payment link; used only for logging/audit.
  let finalAmount;
  let costResult;
  let paymentDescription = req.description
    || req.metadata?.eventName
    || req.eventName
    || `PAYMENT FOR ORDER ${req.reference}`;

  try {
    if (isRentalOrderRequest) {
      costResult = await recalculateRentalFromOrder(req.reference);
      finalAmount = costResult.total;
      paymentDescription = req.metadata?.serviceName
        || req.metadata?.venueName
        || costResult.order?.metadata?.serviceName
        || costResult.order?.metadata?.venueName
        || (String(req.reference).startsWith("SVC-") ? "Reserva de servicio" : "Reserva de lugar");
    } else if (hasSeating) {
      costResult = await recalculateCostsForSeating(eventId, req.tickets);
      finalAmount = costResult.total;
    } else {
      costResult = await recalculateTicketCosts(eventId, req.tickets);
      finalAmount = costResult.total;
    }

    if (req.amount != null && typeof req.amount === "number") {
      const diff = Math.abs(req.amount - finalAmount);
      if (diff > 1) {
        console.info("createPaymentLink amount audit: sentAmount=%s calculatedAmount=%s difference=%s", req.amount, finalAmount, diff);
      }
    }
  } catch (error) {
    console.error("ERROR VALIDATING COSTS:", error);
    return jsonResponse(400, {
      message: isRentalOrderRequest
        ? "ERROR VALIDATING RENTAL ORDER."
        : hasSeating
          ? "ERROR VALIDATING SEAT COSTS OR AVAILABILITY."
          : "ERROR VALIDATING TICKET COSTS.",
      details: error.message,
      errorType: error.name || "ValidationError",
    });
  }

  // FREE CHECKOUT: if all selected tickets are free (costo=false + valor=0), skip payment link creation.
  if (costResult.isFreeCheckout) {
    const responsePayload = {
      paymentRequired: false,
      paymentStatus: "APPROVED",
      freeCheckout: true,
      urlPaymentLink: null,
      eventName: paymentDescription,
      reference: req.reference,
      currency: req.currency || "COP",
      amount: 0,
      redirectUrl: WOMPI_REDIRECT_BASE_URL
        ? `${WOMPI_REDIRECT_BASE_URL}?reference=${encodeURIComponent(req.reference)}&status=APPROVED&freeCheckout=true`
        : null,
    };

    if (costResult.breakdown && costResult.breakdown.length > 0) {
      if (hasSeating) {
        responsePayload.breakdownPerSeat = costResult.breakdown;
      } else {
        responsePayload.breakdownByTicketType = costResult.breakdown;
      }
    }

    return jsonResponse(200, responsePayload);
  }

  if (!WOMPI_PRIVATE_KEY || !WOMPI_REDIRECT_BASE_URL) {
    return jsonResponse(500, { message: "SERVER CONFIGURATION ERROR." });
  }

  // CREATE PAYMENT LINK WITH CALCULATED AMOUNT (BACKEND IS SOURCE OF TRUTH)
  try {
    const paymentLink = await createWompiPaymentLink(
      finalAmount,
      req.reference,
      customerEmail,
      req.currency,
      paymentDescription
    );

    const responsePayload = {
      urlPaymentLink: paymentLink.urlPaymentLink,
      eventName: paymentDescription,
      amount: finalAmount,
      ...paymentLink.paymentLinkData,
    };

    if (costResult.breakdown && costResult.breakdown.length > 0) {
      if (hasSeating) {
        responsePayload.breakdownPerSeat = costResult.breakdown;
        const byCategory = {};
        for (const row of costResult.breakdown) {
          const key = row.category || row.categoryId || "unknown";
          if (!byCategory[key]) byCategory[key] = { unitPrice: row.unitPrice, seatCount: 0, subtotal: 0 };
          byCategory[key].seatCount += 1;
          byCategory[key].subtotal += row.totalWithFees;
        }
        responsePayload.breakdownByCategory = byCategory;
      } else {
        responsePayload.breakdownByTicketType = costResult.breakdown;
      }
    }

    return jsonResponse(200, responsePayload);
  } catch (error) {
    const details = formatWompiError(error);
    console.error("ERROR CREATING PAYMENT LINK:", details);

    return jsonResponse(error.response ? error.response.status : 500, {
      message: "FAILED TO CREATE PAYMENT LINK",
      details,
    });
  }
};

// -----------------------------------------------------------------------------
// RECALCULATE TICKET COSTS (NO SEATING)
// LOADS TICKET TYPES FROM DYNAMODB, MATCHES BY ticketsDistId, APPLIES PRICE + FEES PER UNIT
// -----------------------------------------------------------------------------
const recalculateTicketCosts = async (eventId, tickets) => {
  // VALIDATE eventId IS A NON-EMPTY STRING
  if (!eventId || typeof eventId !== 'string') {
    throw new Error("INVALID EVENT ID");
  }

  // VALIDATE tickets IS A NON-EMPTY ARRAY
  if (!Array.isArray(tickets) || tickets.length === 0) {
    throw new Error("INVALID TICKETS LIST");
  }

  // NORMALIZE EACH ITEM: EXTRACT ticketId (ticketsDistId OR ticket.id) AND quantity; VALIDATE AND ENFORCE LIMITS
  const normalizedTickets = tickets.map(carTicket => {
    const ticketId = carTicket.ticketsDistId ?? carTicket.ticket?.id;
    const quantity = typeof carTicket.quantity === 'number' ? carTicket.quantity : Number(carTicket.quantity);
    if (!String(ticketId)) {
      throw new Error("INVALID TICKET STRUCTURE: TICKETSDISTID (or ticket.id) AND QUANTITY REQUIRED");
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("TICKET QUANTITY MUST BE A POSITIVE INTEGER");
    }
    if (quantity > 100) {
      throw new Error("TICKET QUANTITY EXCEEDS MAXIMUM ALLOWED LIMIT");
    }
    return { ticketId: String(ticketId), quantity };
  });

  // QUERY TICKETS TABLE BY eventId (GSI: eventIdIndex)
  const ticketParams = {
    TableName: process.env.TICKETS_TABLE || "Tickets",
    IndexName: "eventIdIndex",
    KeyConditionExpression: "eventId = :eventId",
    ExpressionAttributeValues: {
      ":eventId": eventId,
    },
  };

  const ticketData = await dynamodb.send(new QueryCommand(ticketParams));

  // REJECT IF NO RECORDS FOR THIS EVENT
  if (!ticketData.Items || ticketData.Items.length === 0) {
    throw new Error("NO TICKETS FOUND FOR EVENT");
  }

  // EXTRACT TICKET TYPES FROM ALL ITEMS (supports multiple floors/categories; boleta object or boletas array)
  const boletas = getAllBoletasFromItems(ticketData.Items);
  if (boletas.length === 0) {
    const firstItem = ticketData.Items[0];
    const keys = Object.keys(firstItem || {}).join(", ");
    throw new Error(
      "NO VALID TICKETS FOUND FOR EVENT. Expected array 'boleta' or 'boletas' in ticket item(s). Item keys: " + keys
    );
  }

  let calculatedTotal = 0;
  let totalBasePrice = 0;
  const breakdown = [];
  let paidLineFound = false;

  // FOR EACH REQUESTED TICKET TYPE: FIND BOLETA IN DB, CHECK STOCK, GET PRICE, ADD BASE + FEES
  for (const requestedTicket of normalizedTickets) {
    const ticketId = requestedTicket.ticketId;
    const boleta = boletas.find(
      b => String(b.id || b.Id) === ticketId || String(b.distributionId) === ticketId
    );

    if (!boleta) {
      throw new Error(`TICKET WITH ID ${ticketId} NOT FOUND`);
    }

    const availableTickets = boleta.cantidadTickets - (boleta.soldTickets || 0) - (boleta.reservedTickets || 0);
    if (availableTickets < requestedTicket.quantity) {
      throw new Error(`REQUESTED QUANTITY (${requestedTicket.quantity}) EXCEEDS AVAILABILITY (${availableTickets}) FOR TICKET ${ticketId}`);
    }

    const { ticketPrice, isFreeTicket } = getTicketPriceAndCostInfo(boleta, ticketId);

    const ticketBasePrice = ticketPrice * requestedTicket.quantity;
    totalBasePrice += ticketBasePrice;

    const unitTotalWithFees = isFreeTicket ? 0 : applyFeesToUnitPrice(ticketPrice);
    const lineTotalWithFees = unitTotalWithFees * requestedTicket.quantity;
    calculatedTotal += lineTotalWithFees;
    if (!isFreeTicket) {
      paidLineFound = true;
    }

    breakdown.push({
      ticketId,
      quantity: requestedTicket.quantity,
      isFreeTicket,
      unitPrice: Math.round(ticketPrice),
      unitTotalWithFees,
      lineTotalWithFees,
    });
  }

  if (paidLineFound && calculatedTotal < 10000) {
    throw new Error("TRANSACTION AMOUNT MUST BE EQUAL OR GREATER THAN $10,000 COP");
  }
  const totalServiceFeesAndTaxes = calculatedTotal - totalBasePrice;
  const serviceFeesPercentage = calculatedTotal > 0 ? (totalServiceFeesAndTaxes / calculatedTotal) * 100 : 0;
  if (paidLineFound && serviceFeesPercentage >= 50) {
    throw new Error(`SERVICE FEES AND TAXES (${serviceFeesPercentage.toFixed(2)}%) EXCEED 50% OF TOTAL AMOUNT`);
  }

  return {
    total: calculatedTotal,
    breakdown,
    isFreeCheckout: !paidLineFound,
  };
};

// -----------------------------------------------------------------------------
// RECALCULATE COSTS FOR SEATING (ONE TICKET ITEM PER SEAT)
// EACH ITEM HAS ticketsDistId (categoryId) OR category AND location.
// PRICE: from Tickets table, boletas; match by boleta.id === categoryId first, then by categoria name.
// For multi-floor events, ensure each boleta has id = category distribution id so the right price is used.
// -----------------------------------------------------------------------------
const recalculateCostsForSeating = async (eventId, tickets) => {
  // VALIDATE eventId AND tickets ARRAY
  if (!eventId || typeof eventId !== 'string') {
    throw new Error("INVALID EVENT ID");
  }
  if (!Array.isArray(tickets) || tickets.length === 0) {
    throw new Error("INVALID TICKETS LIST");
  }

  // EACH TICKET MUST HAVE (ticketsDistId OR ticket_id OR category) AND location OBJECT
  tickets.forEach((t, i) => {
    const id = t.ticketsDistId ?? t.ticket_id;
    const cat = t.category;
    if (!String(id) && !String(cat)) {
      throw new Error(`TICKET AT INDEX ${i}: TICKETSDISTID OR CATEGORY REQUIRED`);
    }
    if (!t.location || (typeof t.location !== 'object')) {
      throw new Error(`TICKET AT INDEX ${i}: LOCATION (row, number, seatLabel) REQUIRED FOR SEATING`);
    }
  });

  // QUERY TICKETS TABLE BY eventId
  const ticketParams = {
    TableName: process.env.TICKETS_TABLE || "Tickets",
    IndexName: "eventIdIndex",
    KeyConditionExpression: "eventId = :eventId",
    ExpressionAttributeValues: { ":eventId": eventId },
  };
  const ticketData = await dynamodb.send(new QueryCommand(ticketParams));
  if (!ticketData.Items || ticketData.Items.length === 0) {
    throw new Error("NO TICKETS FOUND FOR EVENT");
  }

  // EXTRACT TICKET TYPES FROM ALL ITEMS (supports multiple floors/categories; boleta object or boletas array)
  const boletas = getAllBoletasFromItems(ticketData.Items);
  if (boletas.length === 0) {
    const firstItem = ticketData.Items[0];
    const keys = Object.keys(firstItem || {}).join(", ");
    throw new Error("NO VALID TICKETS FOUND FOR EVENT. Expected array 'boleta' or 'boletas'. Item keys: " + keys);
  }

  let calculatedTotal = 0;
  let totalBasePrice = 0;
  const breakdown = [];
  let paidSeatFound = false;

  // Prefer match by categoryId or distributionId (ticketsDistId), then by category name.
  const findBoleta = (ticketId, categoryName) => {
    if (ticketId) {
      const byId = boletas.find(b => String(b.id || b.Id) === ticketId);
      if (byId) return byId;
      const byDistributionId = boletas.find(b => String(b.distributionId) === ticketId);
      if (byDistributionId) return byDistributionId;
    }
    if (categoryName) {
      const catUpper = categoryName.toUpperCase();
      return boletas.find(b => (b.categoria || b.Categoria || "").toString().toUpperCase() === catUpper) || null;
    }
    return null;
  };

  for (const t of tickets) {
    const ticketId = String(t.ticketsDistId ?? t.ticket_id ?? "");
    const categoryName = String(t.category ?? "");

    const boleta = findBoleta(ticketId, categoryName);
    if (!boleta) {
      throw new Error(`TICKET NOT FOUND FOR ticketsDistId=${ticketId || 'N/A'} OR category=${categoryName || 'N/A'}`);
    }

    const label = ticketId || categoryName;
    const { ticketPrice, isFreeTicket } = getTicketPriceAndCostInfo(boleta, label);

    totalBasePrice += ticketPrice;
    const seatTotalWithFees = isFreeTicket ? 0 : applyFeesToUnitPrice(ticketPrice);
    calculatedTotal += seatTotalWithFees;
    if (!isFreeTicket) {
      paidSeatFound = true;
    }

    breakdown.push({
      categoryId: ticketId || null,
      category: categoryName || null,
      isFreeTicket,
      unitPrice: Math.round(ticketPrice),
      totalWithFees: seatTotalWithFees,
    });
  }

  if (paidSeatFound && calculatedTotal < 10000) {
    throw new Error("TRANSACTION AMOUNT MUST BE EQUAL OR GREATER THAN $10,000 COP");
  }
  const totalServiceFeesAndTaxes = calculatedTotal - totalBasePrice;
  const serviceFeesPercentage = calculatedTotal > 0 ? (totalServiceFeesAndTaxes / calculatedTotal) * 100 : 0;
  if (paidSeatFound && serviceFeesPercentage >= 50) {
    throw new Error(`SERVICE FEES AND TAXES (${serviceFeesPercentage.toFixed(2)}%) EXCEED 50% OF TOTAL AMOUNT`);
  }

  return {
    total: calculatedTotal,
    breakdown,
    isFreeCheckout: !paidSeatFound,
  };
};

// -----------------------------------------------------------------------------
// LAMBDA HANDLER: GET WOMPI TRANSACTION BY ID
// FETCHES TRANSACTION DETAILS FROM WOMPI API VIA pathParameters.id_tx
// -----------------------------------------------------------------------------
exports.getTransactionWompi = async (event) => {
  // READ TRANSACTION ID FROM PATH (e.g. /transactions/{id_tx})
  const txID = event.pathParameters ? event.pathParameters.id_tx : null;
  const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY;
  const WOMPI_API_BASE_URL = process.env.WOMPI_API_BASE_URL;

  if (!WOMPI_PRIVATE_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "SERVER CONFIGURATION ERROR." }),
    };
  }

  if (!txID) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "MISSING REQUIRED FIELD TXID. PLEASE PROVIDE A VALID TRANSACTION ID.",
      }),
    };
  }

  try {
    // GET TRANSACTION FROM WOMPI API
    const txWompi = await axios.get(
      `${WOMPI_API_BASE_URL}/transactions/${txID}`,
      {
        headers: {
          Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!txWompi.data.data || !txWompi.data.data.id) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "MISSING TX ID IN WOMPI RESPONSE. PLEASE CHECK THE REQUEST.",
        }),
      };
    }

    // RETURN TRANSACTION DATA WITH CORS HEADERS
    return {
      statusCode: 200,
      body: JSON.stringify({ data: txWompi.data.data }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
    };
  } catch (error) {
    return {
      statusCode: error.response ? error.response.status : 500,
      body: JSON.stringify({
        message: "FAILED TO GET TRANSACTION",
        details: error.response ? error.response.data : error.message,
      }),
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
    };
  }
};

// -----------------------------------------------------------------------------
// LAMBDA HANDLER: WOMPI WEBHOOK
// -----------------------------------------------------------------------------
exports.wompiWebhook = async (event) => {
  const ORDERS_CALLBACK_URL = process.env.ORDERS_PAYMENT_CALLBACK_URL;

  let payload;
  try {
    payload = event.body ? JSON.parse(event.body) : null;
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ message: 'INVALID JSON' }) };
  }

  if (!payload || !payload.data) {
    return { statusCode: 400, body: JSON.stringify({ message: 'INVALID WEBHOOK PAYLOAD' }) };
  }

  const transaction = payload.data.transaction || payload.data;
  const reference = transaction.reference;
  const status = String(transaction.status || '').toUpperCase();
  const transactionId = transaction.id;

  if (!reference) {
    return { statusCode: 400, body: JSON.stringify({ message: 'MISSING REFERENCE' }) };
  }

  if (String(reference).startsWith('PRO-')) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, skipped: true, reason: 'PRO_SUBSCRIPTION_HANDLED_BY_SUBSCRIPTIONS_API' }),
    };
  }

  if (!ORDERS_CALLBACK_URL) {
    return { statusCode: 500, body: JSON.stringify({ message: 'SERVER CONFIG ERROR' }) };
  }

  const mappedStatus = status === 'APPROVED' ? 'APPROVED'
    : (status === 'DECLINED' || status === 'VOIDED' || status === 'ERROR') ? 'REJECTED'
      : status;

  try {
    await axios.post(ORDERS_CALLBACK_URL, {
      reference,
      status: mappedStatus,
      payment_data: {
        gateway: 'wompi',
        transactionId,
        webhookEvent: payload.event,
      },
      payment_method: { type: 'wompi_checkout' },
    }, {
      headers: { 'Content-Type': 'application/json' },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, reference, status: mappedStatus }),
    };
  } catch (error) {
    console.error('wompiWebhook callback error:', error.response?.data || error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'FAILED TO PROCESS WEBHOOK',
        details: error.response?.data || error.message,
      }),
    };
  }
};
