const AWS = require("aws-sdk");
const crypto = require("crypto");
const axios = require("axios");
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const ses = new AWS.SES({ region: "us-east-1" });
const sns = new AWS.SNS(); // Instancia de SNS para el envío de SMS

const OTP_LENGTH = 6; // Longitud del código OTP
const OTP_TTL_MINUTES = 5; // Tiempo de vida en minutos del código OTP
const MAX_ATTEMPTS = 3; // Máximo de intentos fallidos
const LOCK_DURATION_SECONDS = 60 * 60; // Duración del bloqueo en segundos (1 hora)

// Datos de WhatsApp Cloud API de Meta
const WHATSAPP_API_URL = "https://graph.facebook.com/v18.0";
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || "588313857701989";
// Prefer env; fallback al token operativo usado por notificaciones (mismo WABA)
const META_ACCESS_TOKEN =
  process.env.META_ACCESS_TOKEN
  || process.env.WHATSAPP_ACCESS_TOKEN
  || "EAAGzrxZCbEf4BOyBzbItaVxHZB56DrIlxlv72c2fMljhdlrLkF8uY0Xmh00NIYkPaiQWcLM9ZBZCu7Oh4DAfh5UqZC0igUP2TZBYtx5TNlZAzn51NqtyIGOaEYKOESg4tRYNBXl8PuqGiAvCu5yfgYyTxAC3UWMsbjk1ml6zEgLgPL4TQq2x6EfZBfR2ZBYSsqILztQZDZD";

const { buildOtpEmail, buildActivationEmail, buildResetPasswordEmail } = require("./emailTemplate");

const LINK_TTL_MINUTES = 60;
const WEB_APP_BASE_URL = process.env.WEB_APP_BASE_URL || "https://qa.doeventsapp.com";
const SES_FROM_EMAIL =
  process.env.SES_FROM_EMAIL || "notificaciones.doevents@doeventsapp.com";

function generateOTP(length) {
  return crypto
    .randomInt(Math.pow(10, length - 1), Math.pow(10, length))
    .toString();
}

function generateSecureToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function normalizeWhatsAppPhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith("+")) {
    if (digits.startsWith("57") && digits.length >= 12) digits = `+${digits}`;
    else if (digits.length === 10) digits = `+57${digits}`;
    else digits = `+${digits}`;
  }
  const onlyDigits = digits.replace(/\D/g, "");
  return onlyDigits.length >= 10 ? onlyDigits : null;
}

function resolveClientPhone(item) {
  if (!item || typeof item !== "object") return null;
  const candidates = [
    item.phoneNumber,
    item.phone,
    item.telefono,
    item.celular,
    item.whatsapp,
    item.mobile,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeWhatsAppPhone(candidate);
    if (normalized) return normalized;
  }
  const indicativo = String(item.indicativo || "").replace(/[^\d+]/g, "");
  const local = String(item.phoneLocal || item.numero || "").replace(/\D/g, "");
  if (indicativo && local) {
    return normalizeWhatsAppPhone(`${indicativo}${local}`);
  }
  return null;
}

async function sendHtmlEmail(toEmail, subject, html) {
  const safeEmail = (toEmail || "").trim().toLowerCase();
  if (!SES_FROM_EMAIL) {
    throw new Error("SES_FROM_EMAIL no configurado");
  }
  const params = {
    Source: `DoEvents <${SES_FROM_EMAIL}>`,
    Destination: { ToAddresses: [safeEmail] },
    ReplyToAddresses: [SES_FROM_EMAIL],
    Message: {
      Subject: { Data: subject, Charset: "UTF-8" },
      Body: { Html: { Data: html, Charset: "UTF-8" } },
    },
  };
  return ses.sendEmail(params).promise();
}

// Función para enviar OTP por correo electrónico usando SES
async function sendOTPEmail(toEmail, otp) {
  const safeEmail = (toEmail || "").trim().toLowerCase();
  return sendHtmlEmail(
    safeEmail,
    "Tu código de verificación DoEvents",
    buildOtpEmail(safeEmail, otp, OTP_TTL_MINUTES),
  );
}

// Función para enviar OTP por SMS usando SNS
async function sendOTPSMS(phoneNumber, otp) {
  const params = {
    Message: `Tu código OTP es: ${otp}. Este código expirará en ${OTP_TTL_MINUTES} minutos.`,
    PhoneNumber: phoneNumber,
  };

  return sns.publish(params).promise();
}

// Enviar OTP por WhatsApp usando WhatsApp Cloud API
async function sendOTPWhatsApp(phoneNumber, otp) {
  try {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: phoneNumber,
        type: "template",
        template: {
          name: "generarotp",
          language: { code: "es", policy: "deterministic" },
          components: [
            {
              type: "BODY",
              parameters: [{ type: "text", text: otp }],
            },
            {
              type: "BUTTON",
              sub_type: "URL",
              index: "0",
              parameters: [{ type: "text", text: otp }],
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${META_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      },
    );

    console.log("WhatsApp OTP enviado:", response.data);
    return response.data;
  } catch (error) {
    console.error(
      "❌ Error enviando OTP por WhatsApp:",
      error.response?.data || error.message,
    );
    console.error(
      "❌ Error completo:",
      JSON.stringify(error.response?.data || error, null, 2),
    );
    console.error("❌ Status code:", error.response?.status);
    throw error; // Lanzar el error original para ver detalles
  }
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Función Lambda principal
const { withCors, handlePreflight } = require('./cors-web');

const generateOtpHandler = async (event) => {
  // Parsear el body correctamente (puede venir de API Gateway o invocación directa)
  let parsedBody;
  if (typeof event.body === "string") {
    parsedBody = JSON.parse(event.body);
  } else if (event.body) {
    parsedBody = event.body;
  } else {
    // Invocación directa desde CLI
    parsedBody = event;
  }

  const { action, userId, email, phoneNumber, otp, newPassword, sendVia, token, purpose } =
    parsedBody;
  const normalizedEmail = (email || "").trim().toLowerCase();

  // Log de parámetros recibidos para debugging
  console.log("=== PARÁMETROS RECIBIDOS ===");
  console.log("action:", action);
  console.log("userId:", userId);
  console.log("email:", email);
  console.log("normalizedEmail:", normalizedEmail);
  console.log("phoneNumber:", phoneNumber);
  console.log("sendVia:", sendVia);
  console.log("sendVia type:", typeof sendVia);
  console.log("sendVia is array:", Array.isArray(sendVia));
  console.log("============================");

  const actionsWithoutContact = new Set(['verifyLink', 'resetPasswordWithToken']);

  if (!action || (!actionsWithoutContact.has(action) && !normalizedEmail && !phoneNumber)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Parámetros inválidos" }),
    };
  }

  // Validar el formato del email si se proporciona
  if (normalizedEmail && !isValidEmail(normalizedEmail)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Formato de email inválido" }),
    };
  }

  try {
    // Flujo original para generación de OTP
    if (action === "generate") {
      if (!userId) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "El userId es requerido" }),
        };
      }

      // Validar que el email pertenece al userId
      let customerParams;
      if (normalizedEmail) {
        customerParams = {
          TableName: process.env.CLIENT_TABLE || "Client",
          Key: { id: userId },
        };

        const customerResult = await dynamoDb.get(customerParams).promise();

        if (!customerResult.Item) {
          return {
            statusCode: 404,
            body: JSON.stringify({ message: "Usuario no encontrado" }),
          };
        }

        const storedEmail = (customerResult.Item.email || "").toLowerCase();
        if (storedEmail !== normalizedEmail) {
          return {
            statusCode: 400,
            body: JSON.stringify({
              message: "El email no corresponde al userId proporcionado",
            }),
          };
        }
      }
      /*
            // Si se envía phoneNumber, ya no se filtra por userId
           if (phoneNumber) {
                customerParams = {
                    TableName: process.env.CLIENT_TABLE || 'Client',
                    IndexName: 'PhoneIndex',
                    KeyConditionExpression: 'phoneNumber = :phoneNumber',
                    ExpressionAttributeValues: {
                        ':phoneNumber': phoneNumber
                    }
                };
            }
        
            const customerResult = await dynamoDb.query(customerParams).promise();
            const customerExists = email ? customerResult.Item : customerResult.Items.length > 0;
        
            if (!customerExists) {
                return { statusCode: 404, body: JSON.stringify({ message: 'Usuario no encontrado' }) };
            }
            */

      // Generar OTP
      const newOtp = generateOTP(OTP_LENGTH);
      const ttl = Math.floor(Date.now() / 1000) + OTP_TTL_MINUTES * 60;
      const timestamp = Date.now();

      const otpParams = {
        TableName: process.env.OTP_TABLE,
        Item: {
          userId: userId,
          otp: newOtp,
          ttl,
          email: normalizedEmail,
          phoneNumber: phoneNumber,
          timestamp,
          attempts: 0,
        },
      };

      await dynamoDb.put(otpParams).promise();

      // Enviar OTP según el método especificado (soporta string o array)
      try {
        const sendMethods = Array.isArray(sendVia)
          ? sendVia
          : sendVia
            ? [sendVia]
            : normalizedEmail
              ? ["email"]
              : phoneNumber
                ? ["sms"]
                : [];
        const sendPromises = [];
        const results = { success: [], failed: [] };

        // Enviar por cada método especificado
        for (const method of sendMethods) {
          if (method === "email" && normalizedEmail) {
            sendPromises.push(
              sendOTPEmail(normalizedEmail, newOtp)
                .then(() => results.success.push("email"))
                .catch((err) =>
                  results.failed.push({ method: "email", error: err.message }),
                ),
            );
          }
          if (method === "sms" && phoneNumber) {
            sendPromises.push(
              sendOTPSMS(phoneNumber, newOtp)
                .then(() => results.success.push("sms"))
                .catch((err) =>
                  results.failed.push({ method: "sms", error: err.message }),
                ),
            );
          }
          if (method === "whatsapp" && phoneNumber) {
            sendPromises.push(
              sendOTPWhatsApp(phoneNumber, newOtp)
                .then(() => results.success.push("whatsapp"))
                .catch((err) =>
                  results.failed.push({
                    method: "whatsapp",
                    error: err.message,
                  }),
                ),
            );
          }
        }

        await Promise.all(sendPromises);

        if (results.success.length > 0) {
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: `OTP enviado por ${results.success.join(", ")}`,
              sentVia: results.success,
              failed: results.failed.length > 0 ? results.failed : undefined,
            }),
          };
        } else {
          return {
            statusCode: 500,
            body: JSON.stringify({
              message: "Error enviando el OTP",
              errorDesc: "No se pudo enviar por ningún método",
            }),
          };
        }
      } catch (error) {
        return {
          statusCode: 500,
          body: JSON.stringify({
            message: "Error enviando el OTP",
            errorDesc: error.message,
          }),
        };
      }
    }
    // Flujo original para verificación de OTP
    else if (action === "verify") {
      if (!otp) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            message: "El código OTP es requerido para la verificación",
          }),
        };
      }

      const otpParams = {
        TableName: process.env.OTP_TABLE,
        Key: { userId },
      };

      const result = await dynamoDb.get(otpParams).promise();

      if (!result.Item) {
        return {
          statusCode: 404,
          body: JSON.stringify({ message: "OTP no encontrado" }),
        };
      }

      const userOtpData = result.Item;

      if (userOtpData.attempts >= MAX_ATTEMPTS) {
        return {
          statusCode: 403,
          body: JSON.stringify({
            message: "Usuario bloqueado por demasiados intentos fallidos",
          }),
        };
      }

      if (userOtpData.otp === otp) {
        if (userOtpData.ttl >= Math.floor(Date.now() / 1000)) {
          let customerParams;

          if (normalizedEmail) {
            customerParams = {
              TableName: process.env.CLIENT_TABLE || "Client",
              IndexName: "EmailIndex",
              KeyConditionExpression: "email = :email",
              ExpressionAttributeValues: {
                ":email": normalizedEmail,
              },
            };
          } else if (phoneNumber) {
            customerParams = {
              TableName: process.env.CLIENT_TABLE || "Client",
              Key: { id: userId },
            };
          } else {
            return {
              statusCode: 400,
              body: JSON.stringify({
                message: "No se proporcionó un método de validación válido",
              }),
            };
          }

          let customerResult = await dynamoDb.query(customerParams).promise();
          // Fallback para registros antiguos con email en mayúsculas
          if (
            normalizedEmail &&
            customerResult.Items &&
            customerResult.Items.length === 0 &&
            email !== normalizedEmail
          ) {
            const legacyParams = {
              ...customerParams,
              ExpressionAttributeValues: { ":email": email },
            };
            customerResult = await dynamoDb.query(legacyParams).promise();
          }

          const customer = normalizedEmail
            ? customerResult.Items[0]
            : customerResult.Item;

          if (customer) {
            const updateParams = {
              TableName: process.env.CLIENT_TABLE || "Client",
              Key: { id: customer.id },
              UpdateExpression: "set userStatus = :status, otp = :otp",
              ExpressionAttributeValues: {
                ":status": "active",
                ":otp": otp,
              },
            };

            await dynamoDb.update(updateParams).promise();
            return {
              statusCode: 200,
              body: JSON.stringify({
                message: "OTP verificado y usuario actualizado a estado activo",
              }),
            };
          } else {
            return {
              statusCode: 400,
              body: JSON.stringify({ message: "Usuario no encontrado" }),
            };
          }
        } else {
          return {
            statusCode: 400,
            body: JSON.stringify({ message: "OTP expirado" }),
          };
        }
      } else {
        const updateOtpParams = {
          TableName: process.env.OTP_TABLE,
          Key: { userId },
          UpdateExpression: "set attempts = attempts + :incr",
          ExpressionAttributeValues: {
            ":incr": 1,
          },
        };

        await dynamoDb.update(updateOtpParams).promise();
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "OTP inválido" }),
        };
      }
    }
    else if (action === "sendActivationLink") {
      if (!userId) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "El userId es requerido" }),
        };
      }
      const secureToken = generateSecureToken();
      const ttl = Math.floor(Date.now() / 1000) + LINK_TTL_MINUTES * 60;
      await dynamoDb.put({
        TableName: process.env.OTP_TABLE,
        Item: {
          userId,
          tokenHash: hashToken(secureToken),
          purpose: "activation",
          ttl,
          email: normalizedEmail,
          timestamp: Date.now(),
          attempts: 0,
        },
      }).promise();
      const link = `${WEB_APP_BASE_URL}/auth/activate?token=${encodeURIComponent(secureToken)}&userId=${encodeURIComponent(userId)}`;
      await sendHtmlEmail(
        normalizedEmail,
        "Activa tu cuenta DoEvents",
        buildActivationEmail(normalizedEmail, link),
      );
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: "Te enviamos un enlace de activación a tu correo",
        }),
      };
    }
    else if (action === "sendResetLink") {
      if (!userId) {
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, message: "El userId es requerido" }),
        };
      }

      const customerResult = await dynamoDb.get({
        TableName: process.env.CLIENT_TABLE || "Client",
        Key: { id: userId },
      }).promise();

      if (!customerResult.Item) {
        return {
          statusCode: 404,
          body: JSON.stringify({ success: false, message: "Usuario no encontrado" }),
        };
      }

      const storedEmail = (customerResult.Item.email || "").trim().toLowerCase();
      if (normalizedEmail && storedEmail && storedEmail !== normalizedEmail) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            success: false,
            message: "El email no corresponde al usuario",
          }),
        };
      }

      const emailToSend = normalizedEmail || storedEmail;
      if (!emailToSend) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            success: false,
            message: "El usuario no tiene correo registrado",
          }),
        };
      }

      const phoneToSend = normalizeWhatsAppPhone(phoneNumber)
        || resolveClientPhone(customerResult.Item);

      const secureToken = generateSecureToken();
      const whatsappOtp = generateOTP(OTP_LENGTH);
      const ttl = Math.floor(Date.now() / 1000) + LINK_TTL_MINUTES * 60;
      await dynamoDb.put({
        TableName: process.env.OTP_TABLE,
        Item: {
          userId,
          tokenHash: hashToken(secureToken),
          otp: whatsappOtp,
          purpose: "reset",
          ttl,
          email: emailToSend,
          phoneNumber: phoneToSend || undefined,
          timestamp: Date.now(),
          attempts: 0,
        },
      }).promise();

      const link = `${WEB_APP_BASE_URL}/auth/reset-password?token=${encodeURIComponent(secureToken)}&userId=${encodeURIComponent(userId)}&email=${encodeURIComponent(emailToSend)}`;

      const sentVia = [];
      const failed = [];

      try {
        await sendHtmlEmail(
          emailToSend,
          "Restablece tu contraseña DoEvents",
          buildResetPasswordEmail(emailToSend, link),
        );
        sentVia.push("email");
      } catch (sesError) {
        console.error("sendResetLink SES error:", sesError);
        failed.push({ method: "email", error: sesError.message || String(sesError) });
      }

      if (phoneToSend && META_ACCESS_TOKEN) {
        try {
          await sendOTPWhatsApp(phoneToSend, whatsappOtp);
          sentVia.push("whatsapp");
        } catch (waError) {
          console.error("sendResetLink WhatsApp error:", waError.response?.data || waError.message);
          failed.push({
            method: "whatsapp",
            error: waError.response?.data?.error?.message || waError.message || String(waError),
          });
        }
      } else if (!phoneToSend) {
        console.warn("sendResetLink: usuario sin teléfono; solo correo");
      } else {
        console.warn("sendResetLink: META_ACCESS_TOKEN ausente; WhatsApp omitido");
      }

      if (!sentVia.length) {
        return {
          statusCode: 500,
          body: JSON.stringify({
            success: false,
            message: "No se pudo enviar el enlace por correo ni WhatsApp. Intenta más tarde.",
            failed,
          }),
        };
      }

      const channelsLabel = sentVia
        .map((c) => (c === "email" ? "correo" : "WhatsApp"))
        .join(" y ");

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: `Te enviamos un enlace/código para restablecer tu contraseña por ${channelsLabel}`,
          sentVia,
          failed: failed.length ? failed : undefined,
        }),
      };
    }
    else if (action === "verifyLink") {
      if (!userId || !token || !purpose) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Token, userId y purpose son requeridos" }),
        };
      }
      const record = await dynamoDb.get({
        TableName: process.env.OTP_TABLE,
        Key: { userId },
      }).promise();
      const item = record.Item;
      if (!item || item.purpose !== purpose) {
        return {
          statusCode: 404,
          body: JSON.stringify({ success: false, message: "Enlace inválido o expirado" }),
        };
      }
      if (item.ttl < Math.floor(Date.now() / 1000)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, message: "El enlace ha expirado" }),
        };
      }
      if (item.tokenHash !== hashToken(token)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, message: "Enlace inválido" }),
        };
      }
      if (purpose === "activation") {
        await dynamoDb.update({
          TableName: process.env.CLIENT_TABLE || "Client",
          Key: { id: userId },
          UpdateExpression: "set userStatus = :status, termsAccepted = :terms, emailVerifiedAt = :now",
          ExpressionAttributeValues: {
            ":status": "active",
            ":terms": true,
            ":now": new Date().toISOString(),
          },
        }).promise();
      }
      await dynamoDb.delete({
        TableName: process.env.OTP_TABLE,
        Key: { userId },
      }).promise();
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: purpose === "activation"
            ? "Cuenta activada correctamente"
            : "Enlace verificado. Puedes crear tu nueva contraseña",
        }),
      };
    }
    else if (action === "resetPasswordWithToken") {
      if (!userId || !newPassword) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "userId y newPassword son requeridos" }),
        };
      }
      if (!token && !otp) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Token u OTP son requeridos" }),
        };
      }
      const record = await dynamoDb.get({
        TableName: process.env.OTP_TABLE,
        Key: { userId },
      }).promise();
      const item = record.Item;
      if (!item || item.purpose !== "reset") {
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, message: "Enlace o código inválido" }),
        };
      }
      if (item.ttl < Math.floor(Date.now() / 1000)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, message: "El enlace o código ha expirado" }),
        };
      }

      const tokenOk = Boolean(token) && item.tokenHash === hashToken(token);
      const otpOk = Boolean(otp) && String(item.otp || "") === String(otp).trim();
      if (!tokenOk && !otpOk) {
        const attempts = Number(item.attempts || 0) + 1;
        await dynamoDb.update({
          TableName: process.env.OTP_TABLE,
          Key: { userId },
          UpdateExpression: "set attempts = :attempts",
          ExpressionAttributeValues: { ":attempts": attempts },
        }).promise();
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, message: "Enlace o código inválido" }),
        };
      }

      await dynamoDb.update({
        TableName: process.env.CLIENT_TABLE || "Client",
        Key: { id: userId },
        UpdateExpression: "set password = :password, userStatus = :status",
        ExpressionAttributeValues: {
          ":password": newPassword,
          ":status": "active",
        },
      }).promise();
      await dynamoDb.delete({
        TableName: process.env.OTP_TABLE,
        Key: { userId },
      }).promise();
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: "Contraseña actualizada correctamente",
        }),
      };
    }
    // Nuevo action para el cambio de contraseña
    // Nuevo action para cambio de contraseña (sin actualización de contraseña)
    else if (action === "changePassword") {
      let customerParams;

      // Verificar que se proporciona un método de validación (email o teléfono)
      if (normalizedEmail) {
        const emailCheckParams = {
          TableName: process.env.CLIENT_TABLE || "Client",
          IndexName: "EmailIndex",
          KeyConditionExpression: "email = :email",
          ExpressionAttributeValues: {
            ":email": normalizedEmail,
          },
        };
        let emailCheckResult;
        try {
          emailCheckResult = await dynamodb.query(emailCheckParams).promise();
        } catch (error) {
          throw new Error("Error al verificar el email en la base de datos");
        }

        if (emailCheckResult.Items.length > 0) {
          throw new Error("El usuario con este email ya existe");
        }
      } else if (phoneNumber) {
        const phoneCheckParams = {
          TableName: process.env.CLIENT_TABLE || "Client",
          IndexName: "PhoneIndex", // Asegúrate de tener un índice global secundario (GSI) para phoneNumber
          KeyConditionExpression: "phone = :phone",
          ExpressionAttributeValues: {
            ":phone": phone,
          },
        };
        let phoneCheckResult;
        try {
          phoneCheckResult = await dynamodb.get(phoneCheckParams).promise();
        } catch (error) {
          throw new Error(
            "Error al verificar el número de teléfono en la base de datos",
          );
        }

        // Si ya existe un usuario con este número de teléfono, no se puede registrar
        if (phoneCheckResult.Items.length > 0) {
          throw new Error("El usuario con este número de teléfono ya existe");
        }
      } else {
        return {
          statusCode: 400,
          body: JSON.stringify({
            message:
              "No se proporcionó un método de validación válido (email o teléfono)",
          }),
        };
      }

      try {
        // Obtener los datos del cliente (userId)
        const clientResult = await dynamoDb.query(customerParams).promise();

        if (
          !emailCheckResult.Items ||
          emailCheckResult.Items.length ||
          !phoneCheckResult.Items ||
          phoneCheckResult.Items.length === 0
        ) {
          return {
            statusCode: 404,
            body: JSON.stringify({
              message: "Usuario no encontrado en la tabla Client",
            }),
          };
        }

        const userId = clientResult.Items[0].userId; // Recuperamos el userId del cliente

        // Aquí generamos la OTP como normalmente lo harías
        const otp = generateOTP(OTP_LENGTH); // Función que generará el código OTP
        const ttl = Math.floor(Date.now() / 1000) + 300; // Tiempo de vida del OTP (300 segundos = 5 minutos)

        // Guardar el OTP en la tabla OTP
        const otpParams = {
          TableName: process.env.OTP_TABLE,
          Item: {
            userId: userId,
            otp: otp,
            email: email,
            phoneNumber: phoneNumber,
            ttl: ttl,
            attempts: 0, // Inicializar los intentos fallidos a 0
          },
        };

        await dynamoDb.put(otpParams).promise();

        return {
          statusCode: 200,
          body: JSON.stringify({ message: "OTP generado exitosamente", otp }),
        };
      } catch (error) {
        console.error("Error en la generación de OTP:", error);
        return {
          statusCode: 500,
          body: JSON.stringify({
            message: "Error al generar el OTP",
            errorDesc: error.message,
          }),
        };
      }
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Acción no válida" }),
      };
    }
  } catch (error) {
    console.error(
      "Error en la generación, verificación o cambio de contraseña:",
      error,
    );
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Error en la operación",
        errorDesc: error.message,
      }),
    };
  }
};

exports.handler = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) return preflight;
  const response = await generateOtpHandler(event);
  return withCors(event, response);
};
