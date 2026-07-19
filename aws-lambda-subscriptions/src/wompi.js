const axios = require('axios');

const WOMPI_API_BASE_URL = process.env.WOMPI_API_BASE_URL || 'https://sandbox.wompi.co/v1';

async function createWompiPaymentLink(amount, reference, customerEmail, currency, description) {
  const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY;
  const WOMPI_REDIRECT_BASE_URL = process.env.WOMPI_REDIRECT_BASE_URL;
  const WOMPI_WEBHOOK_URL = process.env.WOMPI_WEBHOOK_URL;

  if (!WOMPI_PRIVATE_KEY || !WOMPI_REDIRECT_BASE_URL) {
    throw new Error('SERVER CONFIGURATION ERROR: WOMPI CREDENTIALS MISSING');
  }

  const amountInCents = currency === 'COP'
    ? Math.round(Number(amount) * 100)
    : Math.round(Number(amount) * 100);

  const paymentLinkData = {
    name: description || 'DoEvents PRO',
    single_use: true,
    collect_shipping: false,
    reference,
    amount_in_cents: amountInCents,
    customer_email: customerEmail,
    currency: currency || 'USD',
    description: description || `DoEvents PRO subscription ${reference}`,
    redirect_url: WOMPI_REDIRECT_BASE_URL,
    webhook_url: WOMPI_WEBHOOK_URL,
  };

  const response = await axios.post(
    `${WOMPI_API_BASE_URL}/payment_links`,
    JSON.stringify(paymentLinkData),
    {
      headers: {
        Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
        'Content-Type': 'application/json',
      },
    },
  );

  if (!response.data?.data?.id) {
    throw new Error('MISSING PAYMENT LINK ID IN WOMPI RESPONSE');
  }

  return {
    urlPaymentLink: `https://checkout.wompi.co/l/${response.data.data.id}`,
    paymentLinkData: response.data.data,
  };
}

module.exports = { createWompiPaymentLink };
