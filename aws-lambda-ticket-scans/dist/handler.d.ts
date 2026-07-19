import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
export type ScanStatusResult = "success" | "alreadyUsed" | "invalidCode" | "wrongEvent";
export declare const registerScan: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
//# sourceMappingURL=handler.d.ts.map