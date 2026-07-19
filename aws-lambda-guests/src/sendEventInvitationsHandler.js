const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambdaRegion =
  process.env.AWS_REGION || process.env.DYNAMODB_REGION || "us-east-2";
const lambda = new AWS.Lambda({ region: lambdaRegion });
const { v4: uuidv4 } = require("uuid");
const { getEventImageUrl } = require("./utils/getEventImageUrl");
const { guestResponse } = require("./guestResponse");
const { resolveInviteRecipient } = require("./utils/resolveInviteRecipient");
const { resolveWebAppBaseUrl } = require("./resolveWebAppBaseUrl");

function parseRequestBody(event) {
  if (!event?.body) return {};
  if (typeof event.body === "object") return event.body;
  try {
    return JSON.parse(event.body);
  } catch (error) {
    throw new Error("Invalid JSON body");
  }
}

async function upsertEventGuest(eventId, invitedBy, recipient, now) {
  const eventGuestsTable = process.env.EVENT_GUESTS_TABLE || "EventGuests";
  const existing = await dynamodb
    .query({
      TableName: eventGuestsTable,
      KeyConditionExpression: "eventId = :eventId",
      ExpressionAttributeValues: { ":eventId": eventId },
    })
    .promise();

  const items = existing.Items || [];
  const match = items.find(
    (guest) =>
      (recipient.storageUserId && guest.userId === recipient.storageUserId) ||
      (recipient.favoriteId && guest.favoriteId === recipient.favoriteId) ||
      (recipient.email &&
        guest.email &&
        String(guest.email).toLowerCase() === String(recipient.email).toLowerCase()),
  );

  const phone =
    recipient.phone ||
  `${recipient.phoneIndicative || ""}${recipient.phoneNumber || ""}`.replace(/\s/g, "");

  if (match) {
    const updateParts = [
      "#name = :name",
      "invitedBy = :invitedBy",
      "updatedAt = :updatedAt",
    ];
    const values = {
      ":name": recipient.displayName || match.name || "",
      ":invitedBy": invitedBy,
      ":updatedAt": now,
    };
    const names = { "#name": "name" };

    const nextEmail = recipient.email || match.email;
    if (nextEmail) {
      updateParts.push("email = :email");
      values[":email"] = nextEmail;
    }
    const nextPhone = phone || match.phone;
    if (nextPhone) {
      updateParts.push("phone = :phone");
      values[":phone"] = nextPhone;
    }
    const nextUserId = recipient.storageUserId || match.userId;
    if (nextUserId) {
      updateParts.push("userId = :userId");
      values[":userId"] = nextUserId;
    }
    const nextFavoriteId = recipient.favoriteId || match.favoriteId;
    if (nextFavoriteId) {
      updateParts.push("favoriteId = :favoriteId");
      values[":favoriteId"] = nextFavoriteId;
    }

    await dynamodb
      .update({
        TableName: eventGuestsTable,
        Key: { eventId, guestId: match.guestId },
        UpdateExpression: `SET ${updateParts.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      })
      .promise();
    return match.guestId;
  }

  const guestId = uuidv4();
  const guestItem = {
    eventId,
    guestId,
    name: recipient.displayName || "",
    invitedBy,
    status: "invited",
    createdAt: now,
    updatedAt: now,
  };
  if (recipient.email) guestItem.email = recipient.email;
  if (phone) guestItem.phone = phone;
  if (recipient.storageUserId) guestItem.userId = recipient.storageUserId;
  if (recipient.favoriteId) guestItem.favoriteId = recipient.favoriteId;

  await dynamodb
    .put({
      TableName: eventGuestsTable,
      Item: guestItem,
    })
    .promise();
  return guestId;
}

/**
 * Handler para enviar invitaciones masivas a un evento
 *
 * @param {Object} event - Evento HTTP con:
 *   - pathParameters.eventId: ID del evento
 *   - body: {
 *       invitedBy: "user-id", // Usuario que envía la invitación
 *       users: ["user-id-1", "user-id-2"], // Array de userIds
 *       groups: ["group-id-1", "group-id-2"], // Array de groupIds
 *       channels: ["email", "push", "whatsapp", "inApp"], // Canales de notificación
 *       message: "Mensaje personalizado opcional"
 *     }
 */
exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));

    const { eventId } = event.pathParameters || {};
    const body = parseRequestBody(event);
    const {
      invitedBy,
      users = [],
      favoriteIds = [],
      groups = [],
      channels = ["email", "push", "inApp", "whatsapp"],
      message,
    } = body;

    const normalizeChannel = (channel) => {
      const key = String(channel || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[^a-z_\-]/g, "");

      if (["email", "mail", "correo"].includes(key)) return "email";
      if (["push", "notification"].includes(key)) return "push";
      if (["inapp", "in_app", "in-app", "app"].includes(key)) return "inApp";
      if (["whatsapp", "whats_app", "whatsap", "wa"].includes(key)) return "whatsapp";
      if (["sms", "text", "texto", "mensaje"].includes(key)) return "sms";

      return channel;
    };

    const normalizedChannels = Array.from(
      new Set((Array.isArray(channels) ? channels : []).map(normalizeChannel)),
    );

    console.log("📡 Canales recibidos para invitaciones:", {
      requested: channels,
      normalized: normalizedChannels,
    });

    // Validaciones
    if (!eventId) {
      return guestResponse(400, { error: "eventId is required" });
    }

    if (!invitedBy) {
      return guestResponse(400, { error: "invitedBy is required" });
    }

    const recipientRefs = [
      ...new Set(
        [...users, ...favoriteIds]
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    ];

    if (recipientRefs.length === 0 && groups.length === 0) {
      return guestResponse(400, {
        error: "At least one user, favoriteId or group is required",
      });
    }

    // Verificar que el evento existe y obtener su información
    console.log("Buscando evento con ID:", eventId);
    console.log("Tipo de eventId:", typeof eventId);

    const eventData = await dynamodb
      .get({
        TableName: process.env.EVENTS_TABLE || "Eventos",
        Key: { id: eventId },
      })
      .promise();

    console.log("Evento encontrado:", eventData.Item ? "Sí" : "No");

    if (!eventData.Item) {
      return guestResponse(404, { error: "Event not found" });
    }

    const eventInfo = eventData.Item;
    const resolvedEventDate =
      eventInfo.fechaIni ||
      eventInfo.event_date ||
      eventInfo.date ||
      "";
    const resolvedEventStartTime =
      eventInfo.horaIni ||
      eventInfo.start_time ||
      eventInfo.startTime ||
      "";
    const resolvedEventLocation =
      eventInfo.direccion ||
      eventInfo.ubicacion ||
      eventInfo.event_address ||
      eventInfo.location ||
      eventInfo.address ||
      "";
    const resolvedEventCity =
      eventInfo.ciudad ||
      eventInfo.city ||
      "";

    // Generar link al evento
    const eventSlug = eventInfo.slug || eventInfo.event_slug || eventId;
    const resolvedEventName =
      (
        eventInfo.nombre ||
        eventInfo.event_title ||
        eventInfo.title ||
        eventInfo.event_name ||
        eventInfo.name ||
        eventInfo.eventName ||
        eventInfo.eventTitle ||
        eventSlug
      )
        ?.toString()
        .trim() || eventSlug;
    const webBase = resolveWebAppBaseUrl();
    const eventLink = `${webBase}/events/${eventId}`;
    const eventShareLink = eventLink;

    // Obtener URL firmada de la primera imagen del evento
    console.log(`🖼️ Obteniendo imagen firmada para evento ${eventId}...`);
    const eventImageUrl = await getEventImageUrl(eventId);
    console.log(
      `📸 Imagen del evento: ${eventImageUrl ? "Obtenida" : "No disponible"}`,
    );

    // Obtener información del usuario que invita
    const inviterData = await dynamodb
      .get({
        TableName: process.env.CLIENT_TABLE || "Client",
        Key: { id: invitedBy },
      })
      .promise();

    const inviterName = inviterData.Item
      ? `${inviterData.Item.name || ""} ${
          inviterData.Item.lastName || ""
        }`.trim() || "Alguien"
      : "Alguien";

    // Expandir grupos a referencias de contacto (favoriteId)
    let allRecipientRefs = [...recipientRefs];

    if (groups.length > 0) {
      console.log("Expandiendo grupos:", groups);
      for (const groupId of groups) {
        console.log(`Buscando grupo ${groupId} para usuario ${invitedBy}`);
        try {
          const groupData = await dynamodb
            .get({
              TableName: process.env.FAVORITE_GROUPS_TABLE || "FavoriteGroups",
              Key: {
                userId: invitedBy,
                groupId: groupId,
              },
            })
            .promise();

          console.log("Grupo encontrado:", groupData.Item ? "Sí" : "No");
          if (groupData.Item && groupData.Item.userIds) {
            console.log("Miembros del grupo (raw):", groupData.Item.userIds);
            // userIds viene en formato DynamoDB: [{"S": "userId1"}, {"S": "userId2"}]
            // Si ya está como array simple, usar directamente
            const memberIds = Array.isArray(groupData.Item.userIds)
              ? groupData.Item.userIds.map((item) =>
                  typeof item === "string" ? item : item.S || item,
                )
              : [];
            console.log("IDs de miembros procesados:", memberIds);
            allRecipientRefs = allRecipientRefs.concat(memberIds);
          }
        } catch (error) {
          console.error(`Error al buscar grupo ${groupId}:`, error.message);
          throw error;
        }
      }
    }

    allRecipientRefs = [...new Set(allRecipientRefs.map((value) => String(value).trim()).filter(Boolean))];

    const resolvedRecipients = [];
    const unresolvedRefs = [];

    for (const recipientRef of allRecipientRefs) {
      const resolved = await resolveInviteRecipient(invitedBy, recipientRef);
      if (resolved) {
        resolvedRecipients.push(resolved);
      } else {
        unresolvedRefs.push(recipientRef);
      }
    }

    const uniqueRecipients = new Map();
    resolvedRecipients.forEach((recipient) => {
      if (!uniqueRecipients.has(recipient.storageUserId)) {
        uniqueRecipients.set(recipient.storageUserId, recipient);
      }
    });

    const recipients = Array.from(uniqueRecipients.values());

    if (!recipients.length) {
      return guestResponse(400, {
        error: "No se encontraron destinatarios válidos para invitar",
        unresolvedRefs,
      });
    }

    console.log(`Enviando invitaciones a ${recipients.length} destinatarios`);

    // Crear invitaciones y enviar notificaciones
    const now = new Date().toISOString();
    const invitations = [];
    const notifications = [];

    for (const recipient of recipients) {
      const storageUserId = recipient.storageUserId;
      const invitationId = uuidv4();
      const favoriteUserName = recipient.displayName;
      const invitedUserEmail = recipient.email;
      const invitedUserPhone = recipient.phone;
      const invitedUserPhoneIndicative = recipient.phoneIndicative;
      const invitedUserPhoneNumber = recipient.phoneNumber;

      const existingInvitation = await dynamodb
        .query({
          TableName: process.env.EVENT_INVITATIONS_TABLE || "EventInvitations",
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": `EVENT#${eventId}`,
            ":sk": `USER#${storageUserId}`,
          },
        })
        .promise();

      if (existingInvitation.Items && existingInvitation.Items.length > 0) {
        const existing = existingInvitation.Items[0];

        await dynamodb
          .update({
            TableName: process.env.EVENT_INVITATIONS_TABLE || "EventInvitations",
            Key: {
              PK: existing.PK,
              SK: existing.SK,
            },
            UpdateExpression:
              "SET #status = :status, updatedAt = :updatedAt, createdAt = :createdAt, invitedBy = :invitedBy, #message = :message, channels = :channels, favoriteId = :favoriteId",
            ExpressionAttributeNames: {
              "#status": "status",
              "#message": "message",
            },
            ExpressionAttributeValues: {
              ":status": "pending",
              ":updatedAt": now,
              ":createdAt": now,
              ":invitedBy": invitedBy,
              ":message": message || "",
              ":channels": normalizedChannels,
              ":favoriteId": recipient.favoriteId || null,
            },
          })
          .promise();

        console.log(`Invitación actualizada para usuario ${storageUserId}`);
      } else {
        const invitation = {
          PK: `EVENT#${eventId}`,
          SK: `USER#${storageUserId}#${invitationId}`,
          invitationId,
          eventId,
          userId: storageUserId,
          favoriteId: recipient.favoriteId || null,
          invitedBy,
          inviterName,
          eventName: resolvedEventName,
          eventLink,
          eventShareLink,
          status: "pending",
          channels: normalizedChannels,
          message: message || "",
          createdAt: now,
          updatedAt: now,
          expiresAt: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        };

        await dynamodb
          .put({
            TableName: process.env.EVENT_INVITATIONS_TABLE || "EventInvitations",
            Item: invitation,
          })
          .promise();

        invitations.push(invitation);
        console.log(`Invitación creada para usuario ${storageUserId}`);
      }

      await upsertEventGuest(eventId, invitedBy, recipient, now);

      const fullWhatsAppPhone = invitedUserPhone
        ? invitedUserPhone
        : invitedUserPhoneNumber
          ? `${invitedUserPhoneIndicative || ""}${invitedUserPhoneNumber}`
          : null;

      notifications.push({
        userId: storageUserId,
        eventId,
        eventName: resolvedEventName,
        eventSlug,
        eventDate: resolvedEventDate,
        eventStartTime: resolvedEventStartTime,
        eventLocation: resolvedEventLocation,
        eventCity: resolvedEventCity,
        eventImage:
          eventImageUrl || eventInfo.event_image || eventInfo.image || eventInfo.imagen || "",
        organizerName: eventInfo.organizer_name || inviterName,
        inviterName,
        invitedBy,
        ownerId: invitedBy,
        favoriteUserName,
        email: invitedUserEmail || null,
        phoneIndicative: invitedUserPhoneIndicative || null,
        phoneNumber: invitedUserPhoneNumber || null,
        phone: fullWhatsAppPhone || invitedUserPhone || null,
        message: message || "",
        link: eventLink,
        shareLink: eventShareLink,
        invitationId,
        favoriteId: recipient.favoriteId || null,
      });
    }

    // Enviar notificaciones en batch usando el sistema de notificaciones
    console.log(`Enviando ${notifications.length} notificaciones`);

    const notificationPromises = notifications.map((notificationMeta) => {
      const payload = {
        body: JSON.stringify({
          templateKey: "EVENT_INVITATION",
          userId: notificationMeta.userId,
          channels: normalizedChannels,
          metadata: notificationMeta,
        }),
      };

      console.log(
        `📤 Invocando lambda (${lambdaRegion}) para usuario ${notificationMeta.userId}`,
      );
      console.log(`📦 Payload:`, JSON.stringify(payload, null, 2));

      return lambda
        .invoke({
          FunctionName:
            process.env.NOTIFICATIONS_FUNCTION ||
            (process.env.STAGE === "qa"
              ? "notifications-qa-triggerNotification"
              : "notifications-dev-triggerNotification"),
          InvocationType: "Event",
          Payload: JSON.stringify(payload),
        })
        .promise()
        .then((result) => {
          console.log(
            `✅ Respuesta para ${notificationMeta.userId}:`,
            result.StatusCode,
          );
          if (result.FunctionError) {
            console.error(`❌ Function Error:`, result.FunctionError);
            console.error(`❌ Payload respuesta:`, result.Payload);
          }
          if (result.Payload) {
            const response = JSON.parse(result.Payload);
            console.log(`📄 Response body:`, JSON.stringify(response, null, 2));
          }
          return result;
        })
        .catch((err) => {
          console.error(
            `❌ Error sending notification to ${notificationMeta.userId}:`,
            err.message,
          );
          console.error(`Stack:`, err.stack);
          return null;
        });
    });

    const results = await Promise.all(notificationPromises);
    console.log(
      `📊 Resultados de notificaciones:`,
      results.filter((r) => r).length,
      "exitosas de",
      notifications.length,
    );

    return guestResponse(200, {
      message: "Invitations sent successfully",
      eventId,
      totalInvitations: recipients.length,
      sent: recipients.length,
      newInvitations: invitations.length,
      notificationsSent: notifications.length,
      channels: normalizedChannels,
      unresolvedRefs,
    });
  } catch (error) {
    console.error("Error in sendEventInvitationsHandler:", error);
    if (error.message === "Invalid JSON body") {
      return guestResponse(400, { error: error.message });
    }
    return guestResponse(500, {
      error: "Internal server error",
      message: error.message,
    });
  }
};
