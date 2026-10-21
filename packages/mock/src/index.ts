// Serves saved examples (item.response[]) the way a mock server would:
// match on method and path (with :params and {{vars}} as wildcards), then
// pick an example by x-mock-response-name / x-mock-response-code headers,
// else the first 2xx example, else the first one.
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

export function pick(routes: MockRoute[], method: string, path: string, headers: Record<string, string | undefined>): Response | undefined {
  const candidates = routes.filter((r) => r.method === method && r.pattern.test(path)).flatMap((r) => r.examples);
  const name = headers["x-mock-response-name"];
  const code = headers["x-mock-response-code"];
  if (name) return candidates.find((e) => e.name === name);
  if (code) return candidates.find((e) => String(e.code) === code);
  return candidates.find((e) => (e.code ?? 200) >= 200 && (e.code ?? 200) < 300) ?? candidates[0];
}

export function startMockServer(c: Collection, port = 0, host = "127.0.0.1"): Promise<{ url: string; routes: MockRoute[]; close(): Promise<void> }> {
  const routes = buildRoutes(c);
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const ex = pick(routes, req.method ?? "GET", u.pathname, req.headers as Record<string, string>);
    if (!ex) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return void res.end(JSON.stringify({ error: { name: "mockRequestNotFoundError", message: `No example matches ${req.method} ${u.pathname}` } }));
    }
    const headers: Record<string, string> = {};
    for (const h of (Array.isArray(ex.header) ? ex.header : []) as Header[]) if (!h.disabled && !/^(content-length|transfer-encoding|content-encoding)$/i.test(h.key)) headers[h.key] = h.value;
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
