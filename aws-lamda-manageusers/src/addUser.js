const { v4 } = require("uuid");
const AWS = require("aws-sdk");
const {
  BLOCKED_MESSAGE,
  isEmailBlacklisted,
} = require("./blacklistUtils");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const lambda = new AWS.Lambda(); // Para invocar la función Lambda de logs

/**
 * Sincroniza el nuevo usuario con FavoriteUsers
 * Busca por email o phone usuarios manuales y los actualiza a usuarios registrados
 */
async function syncWithFavoriteUsers(userId, email, phone, userData) {
  try {
    console.log(
      `🔄 Verificando si ${email} o ${phone} existen en FavoriteUsers...`,
    );

    const usersToUpdate = [];

    // 1. Buscar por EMAIL en FavoriteUsers usando GSI-email
    if (email) {
      try {
        const emailQuery = await dynamodb
          .query({
            TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
            IndexName: "GSI-email",
            KeyConditionExpression: "email = :email",
            ExpressionAttributeValues: {
              ":email": email,
            },
          })
          .promise();

        if (emailQuery.Items && emailQuery.Items.length > 0) {
          console.log(
            `✅ Encontrados ${emailQuery.Items.length} registros con email ${email}`,
          );
          usersToUpdate.push(...emailQuery.Items);
        }
      } catch (error) {
        console.error(`❌ Error buscando por email en FavoriteUsers:`, error);
      }
    }

    // 2. Buscar por PHONE en FavoriteUsers usando GSI-phone
    if (phone) {
      try {
        const phoneQuery = await dynamodb
          .query({
            TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
            IndexName: "GSI-phone",
            KeyConditionExpression: "phone = :phone",
            ExpressionAttributeValues: {
              ":phone": phone,
            },
          })
          .promise();

        if (phoneQuery.Items && phoneQuery.Items.length > 0) {
          console.log(
            `✅ Encontrados ${phoneQuery.Items.length} registros con phone ${phone}`,
          );

          // Evitar duplicados (si ya se encontró por email)
          for (const item of phoneQuery.Items) {
            const exists = usersToUpdate.some(
              (u) =>
                u.userId === item.userId && u.favoriteId === item.favoriteId,
            );
            if (!exists) {
              usersToUpdate.push(item);
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error buscando por phone en FavoriteUsers:`, error);
      }
    }

    // 3. Actualizar todos los registros encontrados
    if (usersToUpdate.length > 0) {
      console.log(
        `🔄 Actualizando ${usersToUpdate.length} registros en FavoriteUsers...`,
      );

      const updatePromises = usersToUpdate.map(async (favoriteUser) => {
        try {
          const updateParams = {
            TableName: process.env.FAVORITE_USERS_TABLE || "FavoriteUsers",
            Key: {
              userId: favoriteUser.userId,
              favoriteId: favoriteUser.favoriteId,
            },
            UpdateExpression: `SET 
              invitedUserId = :invitedUserId,
              #name = :name,
              lastName = :lastName,
              email = :email,
              phone = :phone,
              username = :username,
              profileImageUrl = :profileImageUrl,
              originType = :originType,
              updatedAt = :updatedAt`,
            ExpressionAttributeNames: {
              "#name": "name",
            },
            ExpressionAttributeValues: {
              ":invitedUserId": userId,
              ":name": userData.name,
              ":lastName": userData.lastName,
              ":email": userData.email,
              ":phone": userData.phone,
              ":username": userData.user,
              ":profileImageUrl": userData.fotoPerfilUrl || "",
              ":originType": "REGISTERED", // Cambiar de MANUAL a REGISTERED
              ":updatedAt": new Date().toISOString(),
            },
          };

          await dynamodb.update(updateParams).promise();

          console.log(
            `✅ Actualizado FavoriteUsers: userId=${favoriteUser.userId}, favoriteId=${favoriteUser.favoriteId}`,
          );
        } catch (error) {
          console.error(
            `❌ Error actualizando favoriteId ${favoriteUser.favoriteId}:`,
            error,
          );
        }
      });

      await Promise.all(updatePromises);
      console.log(
        `✅ Sincronización con FavoriteUsers completada (${usersToUpdate.length} actualizados)`,
      );
    } else {
      console.log(
        `ℹ️ No se encontraron registros en FavoriteUsers para sincronizar`,
      );
    }
  } catch (error) {
    console.error(`❌ Error general en syncWithFavoriteUsers:`, error);
    // No lanzamos el error para no interrumpir la creación del usuario
  }
}

exports.addUser = async (event) => {
  let response;
  const rquid = v4(); // Generar el RQUID completo aquí para incluirlo en los logs
  const userID = rquid.substring(0, 10); // Acotar el RQUID a las primeras 10 posiciones para usar como userID

  // Función para registrar logs
  const logEvent = async (action, requestBody, responseBody, statusCode) => {
    const logPayload = {
      rquid,
      action,
      requestBody,
      responseBody,
      statusCode,
    };

    const params = {
      FunctionName: "aws-lambda-auditeventlog-dev", // Reemplaza con el nombre de tu función Lambda de logs
      InvocationType: "Event", // InvocationType 'Event' para ejecución asincrónica
      Payload: JSON.stringify({ body: JSON.stringify(logPayload) }),
    };

    try {
      await lambda.invoke(params).promise();
      console.log("Log registrado exitosamente.");
    } catch (error) {
      console.error("Error al invocar el Lambda de log:", error);
    }
  };

  try {
    // Parsear el cuerpo de la solicitud
    const {
      name,
      lastName,
      date,
      phone,
      email,
      user,
      password,
      indicativo,
      fotoPerfilBase64,
      userStatus,
    } = JSON.parse(event.body);

    const normalizedEmail = (email || "").trim().toLowerCase();

    if (
      !name ||
      !lastName ||
      !date ||
      !phone ||
      !normalizedEmail ||
      !user ||
      !password ||
      !indicativo
    ) {
      throw new Error("Todos los campos son obligatorios");
    }

    const blacklistCheck = await isEmailBlacklisted(dynamodb, normalizedEmail);
    if (blacklistCheck.blocked) {
      throw new Error(BLOCKED_MESSAGE);
    }

    // Verificar si el email ya existe en la tabla Client
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
      throw new Error(
        "No se puede registrar el usuario porque ese email ya ha sido usado",
      );
    }
    const userCheckParams = {
      TableName: process.env.CLIENT_TABLE || "Client",
      IndexName: "userIndex", // Asegúrate de tener un GSI para el campo 'user'
      KeyConditionExpression: "#usr = :usrValue", // '#usr' es un alias para 'user' porque 'user' es una palabra reservada
      ExpressionAttributeNames: {
        "#usr": "user",
      },
      ExpressionAttributeValues: {
        ":usrValue": user,
      },
    };

    let userCheckResult;
    try {
      userCheckResult = await dynamodb.query(userCheckParams).promise();
    } catch (error) {
      console.error("Error al verificar el nombre de usuario:", error);
      throw new Error(
        "Error al verificar el nombre de usuario en la base de datos",
      );
    }

    if (userCheckResult.Items.length > 0) {
      throw new Error("El nombre de usuario ya está en uso");
    }
    // Verificar si el phone ya existe en la tabla Client
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
      phoneCheckResult = await dynamodb.query(phoneCheckParams).promise();
    } catch (error) {
      throw new Error(
        "Error al verificar el número de teléfono en la base de datos",
      );
    }

    // Si ya existe un usuario con este número de teléfono, no se puede registrar
    if (phoneCheckResult.Items.length > 0) {
      throw new Error(
        "No se puede registrar el usuario porque ese teléfono ya ha sido usado",
      );
    }

    const createDate = new Date().toISOString();

    // Subir la foto de perfil a S3
    const bucketName = "doeventprofileimagesbucket";
    const fotoPerfilKey = "fotosPerfil/" + user + ".jpg";
    const fotoPerfilBuffer = Buffer.from(fotoPerfilBase64, "base64");

    const s3Params = {
      Bucket: bucketName,
      Key: fotoPerfilKey,
      Body: fotoPerfilBuffer,
      ContentEncoding: "base64",
      ContentType: "image/jpeg",
    };

    await s3.putObject(s3Params).promise();

    // URL de la foto de perfil en S3
    const fotoPerfilUrl = fotoPerfilKey;

    const newTask = {
      rquid,
      id: userID, // Aquí se usa el userID acotado a 10 caracteres
      name,
      lastName,
      date,
      indicativo,
      phone,
      email: normalizedEmail,
      user,
      password,
      createDate,
      fotoPerfilUrl,
      userStatus: "inactive",
      calificacion: 0,
      eventosRealizados: 0,
      experiencia: 0,
      description: "",
      isPublicProfile: true,
      plan: "free", // Plan por defecto
      authProvider: "EMAIL",
      // Seteamos el status inicial como 'inactive'
    };

    // Intentar insertar el nuevo usuario en DynamoDB
    await dynamodb
      .put({
        TableName: process.env.CLIENT_TABLE || "Client",
        Item: newTask,
      })
      .promise();

    // 🔄 SINCRONIZAR CON FAVORITEUSERS
    // Buscar si el email o phone existen en FavoriteUsers como usuarios manuales
    await syncWithFavoriteUsers(userID, normalizedEmail, phone, newTask);

    // Registro exitoso
    const statusDesc = "Registro creado exitosamente";
    response = {
      statusCode: 201,
      headers: {
        "Content-Type": "application/json",
        rquid: rquid,
      },
      body: JSON.stringify({
        success: true,
        message: statusDesc,
        data: {
          userID,
          cliente: { name, lastName, email: normalizedEmail },
          usuario: user,
          userStatus: userStatus ? userStatus : "inactive", // Devolvemos el userStatus
        },
      }),
    };

    // Registrar el log del evento exitoso
    await logEvent("createUser", event.body, response.body, 201);
  } catch (error) {
    console.error("Error al agregar el usuario:", error);

    let errorMessage = "Error interno del servidor";
    let errorDescription = error.message;
    let statusCode = 500;

    if (
      error.message === "Todos los campos son obligatorios" ||
      error.message ===
        "No se puede registrar el usuario porque ese email ya ha sido usado" ||
      error.message ===
        "No se puede registrar el usuario porque ese teléfono ya ha sido usado"
    ) {
      errorMessage = error.message;
      statusCode = 400;
    } else if (error.message === BLOCKED_MESSAGE) {
      errorMessage = error.message;
      statusCode = 403;
    } else if (
      error.message === "Error al verificar el email en la base de datos" ||
      error.message ===
        "Error al verificar el número de teléfono en la base de datos"
    ) {
      errorMessage = error.message;
      statusCode = 500;
    }

    response = {
      statusCode,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: false,
        message: errorMessage,
        desc: errorDescription,
        data: [],
      }),
    };

    // Registrar el log del evento fallido
    await logEvent("createUserError", event.body, response.body, statusCode);
  }

  return response;
};

/**
 * Crear usuario desde redes sociales (Google, Apple, etc.)
 * No requiere subir imagen a S3 porque viene como URL pública
 */
exports.addUserRRSS = async (event) => {
  let response;
  const rquid = v4();
  const userID = rquid.substring(0, 10);

  const logEvent = async (action, requestBody, responseBody, statusCode) => {
    const logPayload = {
      rquid,
      action,
      requestBody,
      responseBody,
      statusCode,
    };

    const params = {
      FunctionName: "aws-lambda-auditeventlog-dev",
      InvocationType: "Event",
      Payload: JSON.stringify({ body: JSON.stringify(logPayload) }),
    };

    try {
      await lambda.invoke(params).promise();
      console.log("Log registrado exitosamente.");
    } catch (error) {
      console.error("Error al invocar el Lambda de log:", error);
    }
  };

  try {
    const {
      name,
      lastName,
      date,
      phone,
      email,
      user,
      indicativo,
      fotoPerfilUrl, // URL pública de Google/Apple
      PLATFORM, // 'google', 'apple', etc.
      userStatus,
    } = JSON.parse(event.body);

    if (!name || !lastName || !email || !user || !PLATFORM) {
      throw new Error(
        "Los campos name, lastName, email, user y PLATFORM son obligatorios",
      );
    }

    const normalizedRrssEmail = String(email || "").trim().toLowerCase();
    const blacklistCheck = await isEmailBlacklisted(dynamodb, normalizedRrssEmail);
    if (blacklistCheck.blocked) {
      throw new Error(BLOCKED_MESSAGE);
    }

    // Verificar si el email ya existe
    const emailCheckParams = {
      TableName: process.env.CLIENT_TABLE || "Client",
      IndexName: "EmailIndex",
      KeyConditionExpression: "email = :email",
      ExpressionAttributeValues: {
        ":email": normalizedRrssEmail,
      },
    };

    const emailCheckResult = await dynamodb.query(emailCheckParams).promise();

    if (emailCheckResult.Items.length > 0) {
      throw new Error(
        "No se puede registrar el usuario porque ese email ya ha sido usado",
      );
    }

    // Verificar si el username ya existe
    const userCheckParams = {
      TableName: process.env.CLIENT_TABLE || "Client",
      IndexName: "userIndex",
      KeyConditionExpression: "#usr = :usrValue",
      ExpressionAttributeNames: {
        "#usr": "user",
      },
      ExpressionAttributeValues: {
        ":usrValue": user,
      },
    };

    const userCheckResult = await dynamodb.query(userCheckParams).promise();

    if (userCheckResult.Items.length > 0) {
      throw new Error("El nombre de usuario ya está en uso");
    }

    const createDate = new Date().toISOString();

    const newTask = {
      rquid,
      id: userID,
      name,
      lastName,
      date: date || createDate,
      indicativo: indicativo || "",
      phone: phone || "",
      email: normalizedRrssEmail,
      user,
      password: "", // Sin password para usuarios de RRSS
      createDate,
      fotoPerfilUrl: fotoPerfilUrl || "", // URL pública de Google/Apple
      platform: PLATFORM.toUpperCase(),
      PLATFORM: PLATFORM.toUpperCase(),
      authProvider: PLATFORM.toUpperCase(),
      userStatus: userStatus || "active", // Usuarios de RRSS son activos por defecto
      calificacion: 0,
      eventosRealizados: 0,
      experiencia: 0,
      description: "",
      isPublicProfile: true,
      plan: "free", // Plan por defecto
    };

    await dynamodb
      .put({
        TableName: process.env.CLIENT_TABLE || "Client",
        Item: newTask,
      })
      .promise();

    // 🔄 Sincronizar con FavoriteUsers
    await syncWithFavoriteUsers(userID, normalizedRrssEmail, phone, newTask);

    const statusDesc = "Usuario de " + PLATFORM + " creado exitosamente";
    response = {
      statusCode: 201,
      headers: {
        "Content-Type": "application/json",
        rquid: rquid,
      },
      body: JSON.stringify({
        success: true,
        message: statusDesc,
        data: {
          userID,
          cliente: { name, lastName, email: normalizedRrssEmail },
          usuario: user,
          userStatus: newTask.userStatus,
          platform: PLATFORM,
        },
      }),
    };

    await logEvent("createUserRRSS", event.body, response.body, 201);
  } catch (error) {
    console.error("Error al agregar el usuario de RRSS:", error);

    let errorMessage = "Error interno del servidor";
    let errorDescription = error.message;
    let statusCode = 500;

    if (
      error.message ===
        "Los campos name, lastName, email, user y PLATFORM son obligatorios" ||
      error.message ===
        "No se puede registrar el usuario porque ese email ya ha sido usado" ||
      error.message === "El nombre de usuario ya está en uso"
    ) {
      errorMessage = error.message;
      statusCode = 400;
    } else if (error.message === BLOCKED_MESSAGE) {
      errorMessage = error.message;
      statusCode = 403;
    }

    response = {
      statusCode,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: false,
        message: errorMessage,
        desc: errorDescription,
        data: [],
      }),
    };

    await logEvent(
      "createUserRRSSError",
      event.body,
      response.body,
      statusCode,
    );
  }

  return response;
};
