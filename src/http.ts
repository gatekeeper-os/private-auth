import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AuthorizationError, type AuthorizationGateway } from "./gateway.js";
import type { OperationRequest } from "./protocol.js";

async function body(request: IncomingMessage): Promise<unknown> {
  if (request.headers["content-type"] !== "application/json") throw new AuthorizationError("JSON_REQUIRED", 415);
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 16_384) throw new AuthorizationError("BODY_TOO_LARGE", 413);
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new AuthorizationError("INVALID_JSON", 400); }
}

function reply(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json", "cache-control": "no-store",
    "x-content-type-options": "nosniff", "referrer-policy": "no-referrer"
  });
  response.end(JSON.stringify(value));
}

/** No generic proxying: caller installs the one explicit catalog-read handler. */
export function createGatewayServer(
  gateway: AuthorizationGateway,
  readCatalog: (request: OperationRequest) => unknown | Promise<unknown>
) {
  const server = createServer(async (request, response) => {
    try {
      // This prototype is SDK-to-server. No cross-origin browser execution surface.
      if (request.headers.origin) throw new AuthorizationError("BROWSER_ORIGIN_DENIED");
      if (request.method === "GET" && request.url === "/health") {
        reply(response, 200, { status: "alive", mode: "experimental" });
      } else if (request.method === "POST" && request.url === "/v1/challenges") {
        reply(response, 201, await gateway.issue(await body(request)));
      } else if (request.method === "POST" && request.url === "/v1/execute") {
        const authorized = await gateway.authorize(await body(request));
        reply(response, 200, { result: await readCatalog(authorized) });
      } else {
        reply(response, 404, { error: "NOT_FOUND" });
      }
    } catch (error) {
      if (error instanceof AuthorizationError) reply(response, error.status, { error: error.code });
      else reply(response, 500, { error: "INTERNAL_ERROR" });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.maxHeadersCount = 32;
  server.timeout = 30_000;
  return server;
}
