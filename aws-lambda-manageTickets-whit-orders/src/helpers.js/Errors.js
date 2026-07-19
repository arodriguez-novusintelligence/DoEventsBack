class HttpError extends Error {
    constructor(statusCode, mensaje, detalle) {
      super(mensaje);
      this.statusCode = statusCode;
      this.detalle = detalle ?? mensaje;
    }
  }
  class BadRequest extends HttpError {   constructor(m,d) { super(400,m,d); } }
  class NotFound  extends HttpError {   constructor(m,d) { super(404,m,d); } }
  class Conflict  extends HttpError {   constructor(m,d) { super(409,m,d); } }
  
  module.exports = { HttpError, BadRequest, NotFound, Conflict };
  