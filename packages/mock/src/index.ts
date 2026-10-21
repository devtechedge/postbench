// Serves saved examples (item.response[]) the way a mock server would:
// match on method and path (with :params and {{vars}} as wildcards), then
// pick an example by x-mock-response-name / x-mock-response-code headers,
// narrow GraphQL examples by operation name, else the first 2xx example,
// else the first one. x-mock-response-delay (ms) delays the reply.
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Collection, Header, RequestObject, Response } from "@postbench/core";
import { toUrlObject, walkItems } from "@postbench/core";

export interface MockRoute {
  method: string;
  pattern: RegExp;
  path: string;
  examples: Response[];
}

/** GraphQL operation name of an example's saved request, if it is a GraphQL body. */
export function graphqlOperation(req: unknown): string | undefined {
  const body = (req as RequestObject | undefined)?.body as { mode?: string; graphql?: { query?: string; operationName?: string } } | undefined;
  if (body?.mode !== "graphql") return undefined;
  return body.graphql?.operationName ?? /\b(?:query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(body.graphql?.query ?? "")?.[1];
}

function operationFromBody(text: string): string | undefined {
  try {
    const j = JSON.parse(text) as { operationName?: string; query?: string };
    return j.operationName ?? /\b(?:query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(j.query ?? "")?.[1];
  } catch {
    return undefined;
  }
}

function pathOf(req: RequestObject | string | undefined): { method: string; path: string } {
  const r: RequestObject = typeof req === "string" ? { url: req } : req ?? {};
  const u = toUrlObject(r.url);
  const segs = Array.isArray(u.path) ? u.path.map((s) => (typeof s === "string" ? s : s.value ?? "")) : typeof u.path === "string" ? u.path.split("/") : [];
  return { method: (r.method ?? "GET").toUpperCase(), path: "/" + segs.filter((s, i) => s !== "" || i < segs.length - 1).join("/") };
}

const toPattern = (path: string) =>
  new RegExp("^" + path.split("/").map((s) => (s.startsWith(":") || /^\{\{.+\}\}$/.test(s) ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("/") + "/?$");

export function buildRoutes(c: Collection): MockRoute[] {
  const routes: MockRoute[] = [];
  for (const { item } of walkItems(c)) {
    if (!item.response?.length) continue;
    const byKey = new Map<string, Response[]>();
    for (const ex of item.response) {
      const { method, path } = pathOf((ex.originalRequest as RequestObject) ?? item.request);
      const k = `${method} ${path}`;
      byKey.set(k, [...(byKey.get(k) ?? []), ex]);
    }
    for (const [k, examples] of byKey) {
      const [method, path] = k.split(" ") as [string, string];
      routes.push({ method, path, pattern: toPattern(path), examples });
    }
  }
  // Literal paths win over parameterised ones.
  return routes.sort((a, b) => (a.path.match(/[:{]/g)?.length ?? 0) - (b.path.match(/[:{]/g)?.length ?? 0));
}

export function pick(routes: MockRoute[], method: string, path: string, headers: Record<string, string | undefined>, operation?: string): Response | undefined {
  let candidates = routes.filter((r) => r.method === method && r.pattern.test(path)).flatMap((r) => r.examples);
  // GraphQL endpoints share one path; narrow by operation name when we can.
  if (operation) {
    const ops = candidates.filter((e) => graphqlOperation(e.originalRequest) === operation);
    if (ops.length) candidates = ops;
  }
  const name = headers["x-mock-response-name"];
  const code = headers["x-mock-response-code"];
  if (name) return candidates.find((e) => e.name === name);
  if (code) return candidates.find((e) => String(e.code) === code);
  return candidates.find((e) => (e.code ?? 200) >= 200 && (e.code ?? 200) < 300) ?? candidates[0];
}

export function startMockServer(c: Collection, port = 0, host = "127.0.0.1"): Promise<{ url: string; routes: MockRoute[]; close(): Promise<void> }> {
  const routes = buildRoutes(c);
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Methods": "*", "Access-Control-Allow-Headers": "*" });
      return void res.end();
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const operation = chunks.length ? operationFromBody(Buffer.concat(chunks).toString("utf8")) : undefined;
    const ex = pick(routes, req.method ?? "GET", u.pathname, req.headers as Record<string, string>, operation);
    if (!ex) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return void res.end(JSON.stringify({ error: { name: "mockRequestNotFoundError", message: `No example matches ${req.method} ${u.pathname}` } }));
    }
    const headers: Record<string, string> = {};
    for (const h of (Array.isArray(ex.header) ? ex.header : []) as Header[]) if (!h.disabled && !/^(content-length|transfer-encoding|content-encoding)$/i.test(h.key)) headers[h.key] = h.value;
    const delay = Number(req.headers["x-mock-response-delay"] ?? 0);
    if (delay > 0) await new Promise((r) => setTimeout(r, Math.min(delay, 30000)));
    res.writeHead(ex.code ?? 200, headers);
    res.end(ex.body ?? "");
  });
  return new Promise((resolve) =>
    server.listen(port, host, () => {
      const p = (server.address() as AddressInfo).port;
      resolve({ url: `http://${host}:${p}`, routes, close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); }) });
    }),
  );
}
