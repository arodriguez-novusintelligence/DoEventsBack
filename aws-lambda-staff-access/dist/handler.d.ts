/**
 * Staff Access – Control de acceso por evento/puerta
 *
 * 1. Admin guarda/edita: POST body con accessControl → se guarda en DynamoDB y se notifica (push, inApp, email) a cada userId del payload.
 * 2. Usuario consulta: GET por userId → devuelve a qué evento, venue y puerta está asignado.
 * 3. Admin consulta: GET por eventId → devuelve el control de acceso guardado (para pintar en el front).
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
export declare const saveAssignments: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
export declare const getAdminView: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
export declare const getEventsStaffSummary: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
export declare const getStaffView: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
//# sourceMappingURL=handler.d.ts.map