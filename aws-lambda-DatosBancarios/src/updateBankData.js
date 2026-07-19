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

const resolveAccountScope = (scopeValue, internationalFlag, currentScope = "LOCAL") => {
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

  if (internationalFlag !== undefined && internationalFlag !== null && internationalFlag !== "") {
    const isInternational = normalizeBoolean(internationalFlag, false);
    return {
      accountScope: isInternational ? "INTERNACIONAL" : "LOCAL",
      isInternational,
      isLocal: !isInternational,
    };
  }

  const preservedScope = String(currentScope || "LOCAL").trim().toUpperCase();
  const isInternational = preservedScope === "INTERNACIONAL";
  return {
    accountScope: isInternational ? "INTERNACIONAL" : "LOCAL",
    isInternational,
    isLocal: !isInternational,
  };
};

const unsetDefaultBankDataForUser = async (userID, exceptId) => {
  if (!userID) return;
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
      .filter((item) => item?.id !== exceptId && item?.isDefault === true)
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

exports.updateBankData = async (event) => {
  let response;
  let ticketResult;
  const Bucket = "lambdaboletasbucket";
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
      id,
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
      esPredeterminado,
      tipoCuentaDestino,
      esCuentaInternacional,
    } = JSON.parse(event.body);

    const normalizedEmail = (email || "").trim().toLowerCase();

    if (tipoPersona === "N") {
      if (
        !id ||
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
        !telefono ||
        !tipoCuenta ||
        !tipoDocumento ||
        !tipoPersona ||
        !titular
      ) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            success: false,
            message: "Todos los campos son obligatorios",
          }),
        };
      }
    } else if (tipoPersona === "J") {
      if (
        !id ||
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
        !responsableIva ||
        !superaTopes
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
    const DocsUpdate = async (bucket, key, base64String) => {
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
    const DocsDelete = async (bucket, key) => {
      const params = {
        Bucket: bucket,
        Key: key,
      };
      try {
        await s3.deleteObject(params).promise();
        console.log(
          `Imagen con key ${key} eliminada exitosamente de ${bucket}`,
        );
      } catch (error) {
        throw new Error(
          `Error al eliminar la imagen con key ${key} de:`,
          error,
        );
        // `Error al eliminar la imagen con key ${key} de ${bucketName}`
      }
    };

    const params = {
      TableName: process.env.DATOS_BANCARIOS_TABLE || "DatosBancarios",
      Key: { id: id },
    };
    const result = await dynamodb.get(params).promise();
    if (!result.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          success: false,
          message: "El dato bancario no existe",
        }),
      };
    }
    const sourceUserID = userID || result.Item.userID;
    const hasDefaultFlag = esPredeterminado !== undefined;
    const isDefault = hasDefaultFlag
      ? normalizeBoolean(esPredeterminado, false)
      : result.Item.isDefault === true;
    const scope = resolveAccountScope(
      tipoCuentaDestino,
      esCuentaInternacional,
      result.Item.accountScope
    );

    if (isDefault) {
      await unsetDefaultBankDataForUser(sourceUserID, id);
    }
    const Bucket1 = "lambdadatobdocumento";
    const Bucket2 = "lambdadatobcertificado";
    const Bucket3 = "lambdadatobcertificadocamaracomercio";
    const Bucket4 = "certificadosrutdatosbancarios";

    const imagenDocumento = result.Item.imgdocumento;
    const certificadoBanc = result.Item.certificadoBancario;
    let certificadoCamaraCom = result.Item.certificadoCamaraComercio;
    let certificaRut = result.Item.certificadoRut;

    console.log("certificadoCamaraCom", certificadoCamaraCom);
    console.log("imagenDocumento", imagenDocumento);
    console.log("certificadoBanc", certificadoBanc);

    if (tipoPersona === "J") {
      if (certificadoCamaraCom.trim() === "") {
        certificadoCamaraCom = id + "_certificadoCamaraComercio";
        certificaRut = id + "_certificadoRut";
        await DocsUpdate(
          Bucket3,
          certificadoCamaraCom,
          certificadoCamaraComercio,
        );
        await DocsUpdate(Bucket4, certificaRut, certificadoRut);
      } else if (certificadoCamaraCom.trim() !== "") {
        await DocsUpdate(
          Bucket3,
          certificadoCamaraCom,
          certificadoCamaraComercio,
        );
        await DocsUpdate(Bucket4, certificaRut, certificadoRut);
      }
    } else if (tipoPersona === "N" && certificadoCamaraCom.trim() !== "") {
      await DocsDelete(Bucket3, certificadoCamaraCom);
      certificadoCamaraCom = "";
    } else if (
      tipoPersona === "N" &&
      certificadoRut.trim() === "" &&
      certificaRut.trim() !== ""
    ) {
      await DocsDelete(Bucket4, certificaRut);
      certificaRut = "";
    }
    await DocsUpdate(Bucket1, imagenDocumento, imgdocumento);
    await DocsUpdate(Bucket2, certificadoBanc, certificadoBancario);

    // Validación inicial: El `ticketId` es obligatorio solo para actualizar el ticket
    const actualizacionDatoBancario = {
      userID: sourceUserID,
      isDefault,
      accountScope: scope.accountScope,
      isInternational: scope.isInternational,
      isLocal: scope.isLocal,
      paisCuenta: paisCuenta,
      tipoPersona: tipoPersona,
      titular: titular,
      tipoDocumento: tipoDocumento,
      documento: documento,
      imgdocumento: imagenDocumento,
      numeroCuenta: numeroCuenta,
      banco: banco,
      tipoCuenta: tipoCuenta,
      codigoSwift: codigoSwift,
      telefono: telefono,
      certificadoBancario: certificadoBanc,
      departamento: departamento,
      ciudad: ciudad,
      direccionFacturacion: direccionFacturacion,
      nombreRazonSocial: nombreRazonSocial,
      regimenSistemaTributario: regimenSistemaTributario,
      certificadoCamaraComercio: certificadoCamaraCom,
      certificadoRut: certificaRut,
      superaTopes: superaTopes,
      responsableIva: responsableIva,
      condicionesPago: condicionesPago,
      email: normalizedEmail,
      updatedAt: new Date().toISOString(),
    };
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    for (const [key, value] of Object.entries(actualizacionDatoBancario)) {
      if (value !== undefined && value !== null) {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      }
    }

    if (updateExpressions.length > 0) {
      const updateParams = {
        TableName: process.env.DATOS_BANCARIOS_TABLE || "DatosBancarios",
        Key: { id: id },
        UpdateExpression: `SET ${updateExpressions.join(", ")}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      };

      await dynamodb.update(updateParams).promise();
    }

    response = {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Datos bancarios actualizados correctamente",
        //data: [],
        //boletas: updatedBoletas,
      }),
    };
  } catch (error) {
    response = {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Error interno del servidor",
        error: error.message,
      }),
    };
  }
  return response;
};
