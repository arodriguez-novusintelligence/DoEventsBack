const AWS = require("aws-sdk");
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

exports.obtenerDatosBancariosPorId = async (event) => {
  let response;
  let certificadoCamaraComercioFirmado = "";
  let certificadoRutFirmado = "";
  try {
    // Obtener el id del dato bancario desde los parámetros de la solicitud
    const datoBancarioId = event.pathParameters.id;
    // Parámetros de consulta para obtener el dato bancario por su id
    const params = {
      TableName: process.env.DATOS_BANCARIOS_TABLE || "DatosBancarios",
      Key: {
        id: datoBancarioId,
      },
    };
    // Realizar la consulta a DynamoDB
    const data = await dynamodb.get(params).promise();
    // Verificar si se encontró el dato bancario
    if (!data.Item) {
      response = {
        statusCode: 404,
        body: JSON.stringify({ message: "Dato bancario no encontrado" }),
      };
    } else {
      const {
        id,
        userID,
        isDefault = false,
        accountScope = "LOCAL",
        isInternational = false,
        isLocal = true,
        paisCuenta,
        tipoPersona,
        titular,
        tipoDocumento,
        documento,
        imgdocumento,
        numeroCuenta,
        banco,
        tipoCuenta,
        codigoSwift,
        telefono,
        certificadoBancario,
        departamento,
        ciudad,
        direccionFacturacion,
        nombreRazonSocial,
        regimenTributario,
        certificadoCamaraComercio,
        certificadoRut,
        superaTopes,
        responsableIva,
        email,
        createdAt,
        updatedAt,
      } = data.Item;

      const firmarDocumento = (key, bucket) => {
        try {
          console.log("Firmar documento:", key, bucket);
          const s3 = new AWS.S3();
          const params = {
            Bucket: bucket,
            Key: key,
          };
          return s3.getSignedUrl("getObject", params);
        } catch (error) {
          console.error("Error al firmar documento:", error);
          return "";
        }
      };
      const getImageBase64 = async (key, bucketName) => {
        try {
          const params = {
            Bucket: bucketName,
            Key: key,
          };

          const data = await s3.getObject(params).promise();

          return data.Body.toString("base64");
        } catch (error) {
          console.error("Error al obtener la imagen en base64:", error);
          return "";
        }
      };
      const Bucket1 = "lambdadatobdocumento";
      const Bucket2 = "lambdadatobcertificado";
      const Bucket3 = "lambdadatobcertificadocamaracomercio";
      const Bucket4 = "certificadosrutdatosbancarios";

      const img_pdfDocumentoFirmado = firmarDocumento(imgdocumento, Bucket1);
      const certificadoBancarioFirmado = firmarDocumento(
        certificadoBancario,
        Bucket2
      );
      if (tipoPersona === "J") {
        certificadoCamaraComercioFirmado = firmarDocumento(
          certificadoCamaraComercio,
          Bucket3
        );
        certificadoRutFirmado = firmarDocumento(certificadoRut, Bucket4);
      } else if (
        tipoPersona === "N" &&
        certificadoRut &&
        certificadoRut.trim() !== ""
      ) {
        certificadoRutFirmado = firmarDocumento(certificadoRut, Bucket4);
      }
      let imagdocumento = await getImageBase64(imgdocumento, Bucket1);
      let certificadBancario = await getImageBase64(
        certificadoBancario,
        Bucket2
      );
      let certificadCamaraComercio = "";
      let certificaRut = "";
      if (tipoPersona === "J") {
        certificadCamaraComercio = await getImageBase64(
          certificadoCamaraComercio,
          Bucket3
        );
        certificaRut = await getImageBase64(certificadoRut, Bucket4);
      } else if (
        tipoPersona === "N" &&
        certificadoRut &&
        certificadoRut.trim() !== ""
      ) {
        certificaRut = await getImageBase64(certificadoRut, Bucket4);
      }
      console.log(imagdocumento);
      response = {
        statusCode: 200,
        body: JSON.stringify({
          data: {
            id,
            userID,
            isDefault,
            accountScope,
            isInternational,
            isLocal,
            paisCuenta,
            tipoPersona,
            titular,
            tipoDocumento,
            documento,
            imgdocumento: imagdocumento,
            numeroCuenta,
            banco,
            tipoCuenta,
            codigoSwift,
            telefono,
            certificadoBancario: certificadBancario,
            departamento,
            ciudad,
            direccionFacturacion,
            nombreRazonSocial,
            regimenTributario,
            superaTopes,
            responsableIva,
            email,
            certificadoCamaraComercio:
              certificadCamaraComercio === ""
                ? certificadoCamaraComercio
                : certificadCamaraComercio,
            certificadoRut: certificaRut === "" ? certificadoRut : certificaRut,
            img_pdfDocumentoFirmado,
            certificadoBancarioFirmado,
            certificadoCamaraComercioFirmado,
            certificadoRutFirmado,
            createdAt,
            updatedAt,
          },
        }),
      };
    }
  } catch (error) {
    console.error("Error al obtener el dato bancario:", error);
    response = {
      statusCode: 500,
      body: JSON.stringify({
        error: "No se pudo obtener el dato bancario",
      }),
    };
  }
  return response;
};
