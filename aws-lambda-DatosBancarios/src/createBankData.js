const { v4 } = require("uuid");
const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

const normalizeBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "si", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return defaultValue;
};

const resolveAccountScope = (scopeValue, internationalFlag) => {
  const normalizedScope = String(scopeValue || "").trim().toUpperCase();
  if (["LOCAL", "NACIONAL"].includes(normalizedScope)) {
    return {
      accountScope: "LOCAL",
      isInternational: false,
      isLocal: true,
    };
  }
  if (["INTERNACIONAL", "INTERNATIONAL", "SWIFT"].includes(normalizedScope)) {
    return {
      accountScope: "INTERNACIONAL",
      isInternational: true,
      isLocal: false,
    };
  }

  const isInternational = normalizeBoolean(internationalFlag, false);
  return {
    accountScope: isInternational ? "INTERNACIONAL" : "LOCAL",
    isInternational,
    isLocal: !isInternational,
  };
};

const unsetDefaultBankDataForUser = async (userID) => {
  const paramsUserId = {
    TableName: process.env.DATOS_BANCARIOS_TABLE || "DatosBancarios",
    IndexName: "UserIdIndex",
    KeyConditionExpression: "userID = :userID",
    ExpressionAttributeValues: {
      ":userID": userID,
    },
  };

  const data = await dynamodb.query(paramsUserId).promise();
  const items = data.Items || [];

  await Promise.all(
    items
      .filter((item) => item?.isDefault === true)
      .map((item) =>
        dynamodb
          .update({
            TableName: process.env.DATOS_BANCARIOS_TABLE || "DatosBancarios",
            Key: { id: item.id },
            UpdateExpression: "SET isDefault = :isDefault, updatedAt = :updatedAt",
            ExpressionAttributeValues: {
              ":isDefault": false,
              ":updatedAt": new Date().toISOString(),
            },
          })
          .promise()
      )
  );
};

// Crear datos bancarios para un usuario
exports.crearDatosBancarios = async (event) => {
  let response;
  const rquid = v4();
  const id = rquid.substring(0, 10);

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "El cuerpo de la solicitud está vacío",
        }),
      };
    }

    const {
      userID = "",
      banco,
      certificadoBancario,
      ciudad,
      codigoSwift,
      departamento,
      direccionFacturacion,
      documento,
      imgdocumento,
      numeroCuenta,
      paisCuenta,
      telefono,
      tipoCuenta,
      tipoDocumento,
      tipoPersona,
      titular,
      nombreRazonSocial = "",
      regimenSistemaTributario = "",
      certificadoCamaraComercio = "",
      certificadoRut = "",
      superaTopes = false,
      responsableIva = false,
      condicionesPago = true,
      email = "",
      esPredeterminado = false,
      tipoCuentaDestino = "",
      esCuentaInternacional = null,
    } = JSON.parse(event.body);

    const normalizedEmail = (email || "").trim().toLowerCase();
    const isDefault = normalizeBoolean(esPredeterminado, false);
    const scope = resolveAccountScope(tipoCuentaDestino, esCuentaInternacional);

    // Validación de tipoPersona
    if (tipoPersona === "N") {
      if (
        !userID ||
        !banco ||
        !certificadoBancario ||
        !ciudad ||
        !departamento ||
        !direccionFacturacion ||
        !documento ||
        !imgdocumento ||
        !numeroCuenta ||
        !paisCuenta ||
        !tipoPersona ||
        !titular ||
        !tipoDocumento ||
        !tipoCuenta ||
        !telefono
      ) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            success: false,
            message: "Para tipoPersona 'N' faltan datos requeridos",
          }),
        };
      }
    } else if (tipoPersona === "J") {
      if (
        !paisCuenta ||
        !tipoPersona ||
        !titular ||
        !tipoDocumento ||
        !documento ||
        !imgdocumento ||
        !numeroCuenta ||
        !banco ||
        !tipoCuenta ||
        !telefono ||
        !certificadoBancario ||
        !departamento ||
        !ciudad ||
        !direccionFacturacion ||
        !nombreRazonSocial ||
        !regimenSistemaTributario ||
        !certificadoCamaraComercio ||
        !certificadoRut ||
        !superaTopes ||
        !responsableIva
      ) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            success: false,
            message: "Para tipoPersona 'J' faltan datos requeridos",
          }),
        };
      }
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: "El tipo de persona debe ser 'N' o 'J'",
        }),
      };
    }

    // Validación de tipoCuenta
    if (tipoCuenta === "3") {
      if (!codigoSwift) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            success: false,
            message: "el tipo de cuenta es '3' el codigo swift es requerido",
          }),
        };
      }
    } else if (tipoCuenta === "4") {
      if (!normalizedEmail) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            success: false,
            message: "el tipo de cuenta es '4' el email es requerido",
          }),
        };
      }
    }

    const Bucket1 = "lambdadatobdocumento";
    const Bucket2 = "lambdadatobcertificado";
    const Bucket3 = "lambdadatobcertificadocamaracomercio";
    const Bucket4 = "certificadosrutdatosbancarios";
    const getContentType = (base64String) => {
      if (!base64String) {
        return "application/octet-stream";
      }
      const mimeTypeMatch = base64String.match(
        /data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/,
      );
      if (mimeTypeMatch && mimeTypeMatch[1]) {
        return mimeTypeMatch[1];
      } else {
        // Intentar deducir el tipo de contenido a partir de la extensión del archivo si la cadena base64 no contiene el tipo MIME
        if (base64String.includes("JVBERi0")) return "application/pdf"; // Detección básica para PDFs
        if (base64String.includes("/9j/")) return "image/jpeg"; // Detección básica para imágenes JPEG
        if (base64String.includes("iVBORw0KGgo")) return "image/png"; // Detección básica para imágenes PNG
        // Añadir más casos según sea necesario
        return "application/octet-stream";
      }
    };

    const manejoDeDocs = async (bucket, key, base64String) => {
      const contentType = getContentType(base64String);
      const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const params = {
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentEncoding: "base64",
        ContentType: contentType,
      };
      await s3.upload(params).promise();
    };

    await manejoDeDocs(Bucket1, id + "_imgdocumento", imgdocumento);
    await manejoDeDocs(
      Bucket2,
      id + "_certificadoBancario",
      certificadoBancario,
    );
    if (tipoPersona === "J") {
      await manejoDeDocs(
        Bucket3,
        id + "_certificadoCamaraComercio",
        certificadoCamaraComercio,
      );
      await manejoDeDocs(Bucket4, id + "_certificadoRut", certificadoRut);
    } else if (tipoPersona === "N" && certificadoRut) {
      // Si el tipo de persona es "N" y se proporciona un certificado de RUT, también se maneja
      await manejoDeDocs(Bucket4, id + "_certificadoRut", certificadoRut);
    }

    let CCC;
    if (tipoPersona === "J") {
      CCC = id + "_certificadoCamaraComercio";
    } else {
      CCC = "";
    }
    const nuevoDatoBancario = {
      id: id,
      userID: userID,
      isDefault,
      accountScope: scope.accountScope,
      isInternational: scope.isInternational,
      isLocal: scope.isLocal,
      paisCuenta: paisCuenta,
      tipoPersona: tipoPersona,
      titular: titular,
      tipoDocumento: tipoDocumento,
      documento: documento,
      imgdocumento: id + "_imgdocumento",
      numeroCuenta: numeroCuenta,
      banco: banco,
      tipoCuenta: tipoCuenta,
      codigoSwift: codigoSwift,
      telefono: telefono,
      certificadoBancario: id + "_certificadoBancario",
      departamento: departamento,
      ciudad: ciudad,
      direccionFacturacion: direccionFacturacion,
      nombreRazonSocial: nombreRazonSocial,
      regimenSistemaTributario: regimenSistemaTributario,
      certificadoCamaraComercio: CCC,
      aceptacionRecaudosReembolsos: true,
      certificadoRut: id + "_certificadoRut",
      superaTopes: superaTopes,
      responsableIva: responsableIva,
      condicionesPago: condicionesPago,
      email: normalizedEmail,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (isDefault) {
      await unsetDefaultBankDataForUser(userID);
    }

    const dbparams = {
      TableName: process.env.DATOS_BANCARIOS_TABLE || "DatosBancarios",
      Item: nuevoDatoBancario,
    };

    await dynamodb.put(dbparams).promise();
    response = {
      statusCode: 201,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: true,
        message: "Datos bancarios creados correctamente",
        data: nuevoDatoBancario,
      }),
    };
  } catch (error) {
    console.error("Error al crear datos bancarios:", error);
    response = {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: false,
        message: "Error interno del servidor",
        error: error.message,
      }),
    };
  }
  return response;
};
