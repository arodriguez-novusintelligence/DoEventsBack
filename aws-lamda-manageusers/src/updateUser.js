const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();

const PROFILE_BUCKET =
  process.env.PROFILE_BUCKET || process.env.IMAGE_BUCKET || "doeventprofileimagesbucket";
const PROFILE_BUCKET_REGION =
  process.env.PROFILE_BUCKET_REGION || process.env.S3_BUCKET_REGION || "us-east-1";
const LEGACY_PROFILE_BUCKET = "doeventprofileimagesbucket";

const s3 = new AWS.S3({
  region: PROFILE_BUCKET_REGION,
  signatureVersion: "v4",
});

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ""));

const getProfileBucketKey = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (!isHttpUrl(raw)) return raw;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname;
    const path = parsed.pathname.replace(/^\/+/, "");

    const buckets = [PROFILE_BUCKET, LEGACY_PROFILE_BUCKET];
    for (const bucket of buckets) {
      if (host === `${bucket}.s3.amazonaws.com` || host.startsWith(`${bucket}.s3.`)) {
        return path || null;
      }
      if (host.includes("amazonaws.com") && path.startsWith(`${bucket}/`)) {
        return path.slice(bucket.length + 1) || null;
      }
    }
  } catch (error) {
    return null;
  }

  return null;
};

exports.updateUser = async (event) => {
  let response;

  try {
    const hasValue = (value) => {
      if (value === undefined || value === null) return false;
      if (typeof value === "string") return value.trim() !== "";
      return true;
    };

    const normalizeIndicativo = (value) => {
      if (!hasValue(value)) return "";
      return String(value).replace(/\+/g, "").trim();
    };

    // Parsear el cuerpo de la solicitud
    const {
      id,
      userId: requestUserId,
      email,
      name,
      lastName,
      date,
      phone,
      phoneNumber,
      phoneIndicative,
      countryCode,
      user,
      password,
      fotoPerfilBase64, // Añadir fotoPerfilBase64
      calificacion,
      description,
      eventosRealizados,
      experiencia,
      indicativo,
      plan, // Agregar plan
      accountType,
      companyName,
      companyWebsite,
      companyIndustry,
      companyDescription,
    } = JSON.parse(event.body);

    const normalizedEmail = (email || "").trim().toLowerCase();
    const normalizedUserId = String(id || requestUserId || "").trim();

    if (!normalizedEmail && !normalizedUserId) {
      throw new Error(
        "Debe enviar email o id para identificar al usuario",
      );
    }

    let userItem;

    if (normalizedUserId) {
      const getUserByIdParams = {
        TableName: process.env.CLIENT_TABLE || "Client",
        Key: { id: normalizedUserId },
        ProjectionExpression: "id, email, fotoPerfilUrl, #usr",
        ExpressionAttributeNames: { "#usr": "user" },
      };

      const userByIdResult = await dynamodb.get(getUserByIdParams).promise();
      userItem = userByIdResult.Item;

      if (!userItem) {
        throw new Error("No se encontró un usuario con el id proporcionado");
      }

      if (normalizedEmail) {
        const storedEmailById = (userItem.email || "").toLowerCase();
        if (storedEmailById && storedEmailById !== normalizedEmail) {
          throw new Error(
            "El email no coincide con el registro del id proporcionado",
          );
        }
      }
    } else {
      const getIdParams = {
        TableName: process.env.CLIENT_TABLE || "Client",
        IndexName: "EmailIndex", // Asegúrate de que este sea el nombre correcto del índice
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: {
          ":email": normalizedEmail,
        },
        ProjectionExpression: "id, email, fotoPerfilUrl, #usr", // Obtener también fotoPerfilUrl y user
        ExpressionAttributeNames: { "#usr": "user" },
      };

      let idResult = await dynamodb.query(getIdParams).promise();

      // Fallback para registros antiguos con email en mayúsculas
      if (idResult.Items.length === 0 && email !== normalizedEmail) {
        const legacyParams = {
          ...getIdParams,
          ExpressionAttributeValues: { ":email": email },
        };
        idResult = await dynamodb.query(legacyParams).promise();
      }

      if (idResult.Items.length === 0) {
        throw new Error("No se encontró un usuario con el email proporcionado");
      }

      userItem = idResult.Items[0];

      // Validar que el id y el email coincidan en el mismo registro
      const storedEmail = (userItem.email || "").toLowerCase();
      if (!storedEmail || storedEmail !== normalizedEmail) {
        throw new Error("El email no coincide con el registro encontrado");
      }
    }
    const userId = userItem.id;

    const normalizedUsername = hasValue(user) ? String(user).trim() : "";

    // Validar que el campo user (si se envía) sea único para otros usuarios
    if (normalizedUsername) {
      const userQueryParams = {
        TableName: process.env.CLIENT_TABLE || "Client",
        IndexName: "userIndex", // Asegúrate de tener un índice secundario global para 'user'
        KeyConditionExpression: "#user = :user",
        ExpressionAttributeNames: {
          "#user": "user",
        },
        ExpressionAttributeValues: {
          ":user": normalizedUsername,
        },
        ProjectionExpression: "id",
      };

      const userQueryResult = await dynamodb.query(userQueryParams).promise();

      // Si existe un usuario con ese 'user' y el id es diferente, no se puede actualizar
      if (
        userQueryResult.Items.length > 0 &&
        userQueryResult.Items[0].id !== userId
      ) {
        throw new Error("El nombre de usuario ya está en uso por otro usuario");
      }
    }

    const normalizedIndicativo = normalizeIndicativo(
      indicativo || phoneIndicative || countryCode,
    );

    const normalizedCountryCode = hasValue(countryCode)
      ? String(countryCode).trim().startsWith("+")
        ? String(countryCode).trim()
        : `+${String(countryCode).trim()}`
      : hasValue(normalizedIndicativo)
        ? `+${normalizedIndicativo}`
        : "";

    const normalizedPhone = hasValue(phone)
      ? (() => {
          const raw = String(phone).trim();
          const digits = raw.replace(/\D/g, "");
          if (!digits) return "";
          return raw.startsWith("+") ? `+${digits}` : `+${digits}`;
        })()
      : hasValue(phoneNumber)
        ? (() => {
            const digits = String(phoneNumber).replace(/\D/g, "");
            if (!digits) return "";
            const ind = String(normalizedIndicativo || "").replace(/\D/g, "");
            if (ind && !digits.startsWith(ind)) return `+${ind}${digits}`;
            return `+${digits}`;
          })()
        : "";

    const normalizedPhoneNumber = hasValue(phoneNumber)
      ? String(phoneNumber).replace(/\D/g, "")
      : hasValue(phone)
        ? (() => {
            const digits = String(phone).replace(/\D/g, "");
            const ind = normalizedIndicativo.replace(/\D/g, "");
            if (ind && digits.startsWith(ind)) {
              return digits.slice(ind.length);
            }
            return digits;
          })()
        : "";

    // Configurar los parámetros para la actualización
    const updateExpression = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    // Si se proporciona una nueva foto de perfil, actualizarla en S3
    if (fotoPerfilBase64) {
      const safeProfileOwner =
        normalizedUsername || userItem.user || userId || "usuario";
      const existingBucketKey = getProfileBucketKey(userItem.fotoPerfilUrl);
      const fotoPerfilKey =
        existingBucketKey || `fotosPerfil/${safeProfileOwner}.jpg`;

      const fotoPerfilBuffer = Buffer.from(fotoPerfilBase64, "base64");

      const s3Params = {
        Bucket: PROFILE_BUCKET,
        Key: fotoPerfilKey,
        Body: fotoPerfilBuffer,
        ContentEncoding: "base64",
        ContentType: "image/jpeg",
      };

      await s3.putObject(s3Params).promise();

      // Actualizar fotoPerfilUrl y timestamp siempre que se sube una imagen
      updateExpression.push("#fotoPerfilUrl = :fotoPerfilUrl");
      expressionAttributeNames["#fotoPerfilUrl"] = "fotoPerfilUrl";
      expressionAttributeValues[":fotoPerfilUrl"] = fotoPerfilKey;

      // Agregar timestamp de última actualización de foto
      updateExpression.push("#fotoPerfilUpdatedAt = :fotoPerfilUpdatedAt");
      expressionAttributeNames["#fotoPerfilUpdatedAt"] = "fotoPerfilUpdatedAt";
      expressionAttributeValues[":fotoPerfilUpdatedAt"] =
        new Date().toISOString();
    }

    if (hasValue(name)) {
      updateExpression.push("#name = :name");
      expressionAttributeNames["#name"] = "name";
      expressionAttributeValues[":name"] = name;
    }
    if (hasValue(lastName)) {
      updateExpression.push("#lastName = :lastName");
      expressionAttributeNames["#lastName"] = "lastName";
      expressionAttributeValues[":lastName"] = lastName;
    }
    if (hasValue(date)) {
      updateExpression.push("#date = :date");
      expressionAttributeNames["#date"] = "date";
      expressionAttributeValues[":date"] = date;
    }
    if (hasValue(normalizedPhone)) {
      updateExpression.push("#phone = :phone");
      expressionAttributeNames["#phone"] = "phone";
      expressionAttributeValues[":phone"] = normalizedPhone;

      updateExpression.push("#phoneNumber = :phoneNumber");
      expressionAttributeNames["#phoneNumber"] = "phoneNumber";
      expressionAttributeValues[":phoneNumber"] = normalizedPhoneNumber;
    }
    if (normalizedUsername) {
      updateExpression.push("#user = :user");
      expressionAttributeNames["#user"] = "user";
      expressionAttributeValues[":user"] = normalizedUsername;
    }
    if (hasValue(password)) {
      updateExpression.push("#password = :password");
      expressionAttributeNames["#password"] = "password"; // Usa un alias sin caracteres especiales
      expressionAttributeValues[":password"] = password;
    }
    if (hasValue(calificacion)) {
      updateExpression.push("#calificacion = :calificacion");
      expressionAttributeNames["#calificacion"] = "calificacion"; // Usa un alias sin caracteres especiales
      expressionAttributeValues[":calificacion"] = calificacion;
    }
    if (hasValue(description)) {
      updateExpression.push("#description = :description");
      expressionAttributeNames["#description"] = "description"; // Usa un alias sin caracteres especiales
      expressionAttributeValues[":description"] = description;
    }
    if (hasValue(accountType)) {
      updateExpression.push("#accountType = :accountType");
      expressionAttributeNames["#accountType"] = "accountType";
      expressionAttributeValues[":accountType"] = String(accountType).toUpperCase() === "COMPANY" ? "COMPANY" : "PERSONAL";
    }
    if (hasValue(companyName)) {
      updateExpression.push("#companyName = :companyName");
      expressionAttributeNames["#companyName"] = "companyName";
      expressionAttributeValues[":companyName"] = companyName;
    }
    if (hasValue(companyWebsite)) {
      updateExpression.push("#companyWebsite = :companyWebsite");
      expressionAttributeNames["#companyWebsite"] = "companyWebsite";
      expressionAttributeValues[":companyWebsite"] = companyWebsite;
    }
    if (hasValue(companyIndustry)) {
      updateExpression.push("#companyIndustry = :companyIndustry");
      expressionAttributeNames["#companyIndustry"] = "companyIndustry";
      expressionAttributeValues[":companyIndustry"] = companyIndustry;
    }
    if (hasValue(companyDescription)) {
      updateExpression.push("#companyDescription = :companyDescription");
      expressionAttributeNames["#companyDescription"] = "companyDescription";
      expressionAttributeValues[":companyDescription"] = companyDescription;
    }
    if (hasValue(eventosRealizados)) {
      updateExpression.push("#eventosRealizados = :eventosRealizados");
      expressionAttributeNames["#eventosRealizados"] = "eventosRealizados"; // Usa un alias sin caracteres especiales
      expressionAttributeValues[":eventosRealizados"] = eventosRealizados;
    }
    if (hasValue(experiencia)) {
      updateExpression.push("#experiencia = :experiencia");
      expressionAttributeNames["#experiencia"] = "experiencia"; // Usa un alias sin caracteres especiales
      expressionAttributeValues[":experiencia"] = experiencia;
    }
    if (hasValue(normalizedIndicativo)) {
      updateExpression.push("#indicativo = :indicativo");
      expressionAttributeNames["#indicativo"] = "indicativo"; // Usa un alias sin caracteres especiales
      expressionAttributeValues[":indicativo"] = normalizedIndicativo;

      updateExpression.push("#countryCode = :countryCode");
      expressionAttributeNames["#countryCode"] = "countryCode";
      expressionAttributeValues[":countryCode"] = normalizedCountryCode;
    }
    if (hasValue(plan)) {
      updateExpression.push("#plan = :plan");
      expressionAttributeNames["#plan"] = "plan";
      expressionAttributeValues[":plan"] = plan;
    }
    if (updateExpression.length === 0) {
      throw new Error("No se proporcionaron campos para actualizar");
    }

    const params = {
      TableName: process.env.CLIENT_TABLE || "Client",
      Key: {
        id: userId,
      },
      UpdateExpression: `SET ${updateExpression.join(", ")}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };

    // Ejecutar la actualización
    const result = await dynamodb.update(params).promise();

    // Respuesta exitosa
    response = {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        statusDesc: "Usuario actualizado exitosamente",
        statusCode: 200,
        updatedAttributes: result.Attributes,
      }),
    };
  } catch (error) {
    console.error("Error al actualizar el usuario:", error);

    // Manejo de errores
    let errorMessage = "Error interno del servidor";
    let errorDescription = error.message;
    let statusCode = 500;

    if (
      error.message ===
        "Debe enviar email o id para identificar al usuario" ||
      error.message === "No se encontró un usuario con el id proporcionado" ||
      error.message ===
        "No se encontró un usuario con el email proporcionado" ||
      error.message ===
        "El email no coincide con el registro del id proporcionado" ||
      error.message === "No se proporcionaron campos para actualizar" ||
      error.message === "El nombre de usuario ya está en uso por otro usuario"
    ) {
      errorMessage = error.message;
      statusCode = 400;
    }

    response = {
      statusCode,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        statusDesc: errorMessage,
        statusMessage: errorDescription,
        statusCode,
      }),
    };
  }

  return response;
};
