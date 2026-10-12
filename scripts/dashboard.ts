import { createServer, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { z } from "zod";
import { localEnvironment } from "./local-environment.js";
import type { Presentation } from "../src/protocol.js";

const actionSchema = z.object({
  action: z.enum(["grant", "revoke", "request", "stage", "execute", "replay"]),
  agent: z.enum(["alice", "bob", "carol", "outsider"])
}).strict();

/** Loopback-only demo harness. It owns disposable identities; it is not a production admin API. */
export async function dashboard() {
  const env = await localEnvironment();
  const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../web/app.js", import.meta.url), "utf8");
  const style = await readFile(new URL("../web/style.css", import.meta.url), "utf8");
  let origin = "";
  let busy = false;
  let sequence = 0;
  let pending: { agent: string; presentation: Presentation } | undefined;
  const events: { id: number; time: string; label: string; outcome: string; elapsedMs: number }[] = [];
  function json(response: ServerResponse, status: number, value: unknown) {
    response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    response.end(JSON.stringify(value));
  }
  const server = createServer(async (request, response) => {
    // Denies DNS rebinding, cross-origin requests, and proxy forwarding.
    if (request.headers.host !== new URL(origin).host || request.headers["x-forwarded-host"] ||
        (request.headers.origin && request.headers.origin !== origin)) {
      json(response, 403, { error: "LOCAL_CONSOLE_ONLY" }); return;
    }
    if (request.method === "GET" && ["/", "/app.js", "/style.css"].includes(request.url ?? "")) {
      const content = request.url === "/" ? html : request.url === "/app.js" ? script : style;
      response.writeHead(200, {
        "content-type": request.url === "/" ? "text/html; charset=utf-8" : request.url === "/app.js" ? "text/javascript" : "text/css",
        "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
        "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
      });
      response.end(content); return;
    }
    if (request.method === "GET" && request.url === "/api/state") {
      json(response, 200, {
        enrolled: [...env.enrolled], epoch: env.epoch.toString(), root: env.group.root.toString(),
        executions: env.executions, registry: env.domain.registry, chainId: env.domain.chainId,
        audience: env.domain.audience, busy, pendingAgent: pending?.agent ?? null, events
      }); return;
    }
    if (request.method !== "POST" || request.url !== "/api/action") { json(response, 404, { error: "NOT_FOUND" }); return; }
    if (request.headers.origin !== origin || request.headers["content-type"] !== "application/json") {
      json(response, 403, { error: "LOCAL_CONSOLE_ONLY" }); return;
    }
    if (busy) { json(response, 409, { error: "DEMO_BUSY" }); return; }
    busy = true;
    const start = performance.now();
    try {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 1024) { json(response, 413, { error: "BODY_TOO_LARGE" }); return; }
        chunks.push(Buffer.from(chunk));
      }
      const parsed = actionSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      if (!parsed.success) { json(response, 400, { error: "INVALID_ACTION" }); return; }
      const { action, agent } = parsed.data;
      let outcome: string;
      if (action === "grant" || action === "revoke") {
        const previous = env.enrolled.has(agent);
        if (action === "grant") env.enrolled.add(agent); else env.enrolled.delete(agent);
        try { await env.publish(); }
        catch {
          if (previous) env.enrolled.add(agent); else env.enrolled.delete(agent);
          throw new Error("REGISTRY_UPDATE_FAILED");
        }
        outcome = `Registry updated · epoch ${env.epoch}`;
      } else if (action === "stage" || action === "request") {
        const prepared = await env.prepare(agent);
        pending = { agent, presentation: prepared.presentation };
        if (action === "stage") outcome = "Proof ready · not submitted";
        else {
          const result = await env.execute(pending.presentation);
          outcome = result.status === 200 ? "Allowed · catalog read completed" : `Denied · ${String(result.body.error)}`;
        }
      } else {
        if (!pending) { json(response, 409, { error: "NO_STAGED_PROOF" }); return; }
        const result = await env.execute(pending.presentation);
        outcome = result.status === 200 ? "Allowed · catalog read completed" : `Denied · ${String(result.body.error)}`;
      }
      const label = `${action} · ${action === "execute" || action === "replay" ? pending?.agent : agent}`;
      events.unshift({ id: ++sequence, time: new Date().toISOString(), label, outcome, elapsedMs: Math.round(performance.now() - start) });
      events.splice(50);
      json(response, 200, { outcome });
    } catch {
      const outcome = "Denied or unavailable · no permission assumed";
      events.unshift({ id: ++sequence, time: new Date().toISOString(), label: "attempt", outcome, elapsedMs: Math.round(performance.now() - start) });
      events.splice(50);
      json(response, 400, { error: outcome });
    } finally { busy = false; }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.timeout = 30_000;
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("LISTEN_FAILED");
  origin = `http://127.0.0.1:${address.port}`;
  const timer = setInterval(() => { void env.connection.provider.request({ method: "evm_mine" }).catch(() => {}); }, 10_000);
  return {
    origin,
    async close() {
      clearInterval(timer);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await env.close();
    }
  };
}
