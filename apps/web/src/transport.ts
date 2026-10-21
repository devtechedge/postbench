// Sends a prepared request. In the desktop app the Electron preload exposes
// the Node engine (no CORS, cookies, proxies). In a browser we use fetch.
import { applySimpleAuth, type PreparedRequest } from "@postbench/engine/prepare";

export interface WireResponse {
  code: number;
  status: string;
  headers: { key: string; value: string }[];
  body: Uint8Array;
  responseTime: number;
  responseSize: number;
  timings?: Record<string, number>;
  cookies?: { name: string; value: string; domain?: string; path?: string }[];
  url: string;
}

declare global {
  interface Window {
    postbenchDesktop?: { send(req: PreparedRequest): Promise<WireResponse> };
  }
}

export const isDesktop = () => typeof window !== "undefined" && !!window.postbenchDesktop;

export async function sendRequest(req: PreparedRequest): Promise<WireResponse> {
  if (window.postbenchDesktop) return window.postbenchDesktop.send(req);
  const r: PreparedRequest = { ...req, headers: req.headers.map((h) => ({ ...h })) };
  if (!applySimpleAuth(r)) throw new Error(`${r.auth?.type} auth needs the desktop app or CLI (it signs requests with Node crypto)`);
  const headers = new Headers();
  for (const h of r.headers) {
    try {
      headers.append(h.key, h.value);
    } catch {
      // Forbidden header names are dropped by the browser.
    }
  }
  let body: BodyInit | undefined;
  const b = r.body;
  if (b.kind === "text" || b.kind === "urlencoded") body = b.text;
  else if (b.kind === "file") body = b.content ?? "";
  else if (b.kind === "formdata") {
    const fd = new FormData();
    for (const p of b.parts) {
      if (p.src !== undefined) fd.append(p.name, new Blob([""]), p.src);
      else fd.append(p.name, p.value ?? "");
    }
    headers.delete("Content-Type");
    body = fd;
  }
  const t0 = performance.now();
  const res = await fetch(r.url, { method: r.method, headers, body, redirect: "follow" });
  const buf = new Uint8Array(await res.arrayBuffer());
  const total = Math.round(performance.now() - t0);
  const list: { key: string; value: string }[] = [];
  res.headers.forEach((value, key) => list.push({ key, value }));
  return { code: res.status, status: res.statusText, headers: list, body: buf, responseTime: total, responseSize: buf.byteLength, timings: { total }, url: res.url };
}
