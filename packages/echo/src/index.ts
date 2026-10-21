// A small echo server modelled on the public postman-echo endpoint shapes,
// so collections written against postman-echo.com can run offline.
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";

export interface EchoServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

type Json = Record<string, unknown>;

function parseCookies(header = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function parseMultipart(body: Buffer, boundary: string): { form: Json; files: Json } {
  const form: Json = {};
  const files: Json = {};
  const parts = body.toString("latin1").split(`--${boundary}`);
  for (const raw of parts) {
    if (!raw || raw.startsWith("--")) continue;
    const sep = raw.indexOf("\r\n\r\n");
    if (sep < 0) continue;
    const head = raw.slice(0, sep);
    const content = raw.slice(sep + 4).replace(/\r\n$/, "");
    const name = /name="([^"]*)"/.exec(head)?.[1] ?? "";
    const filename = /filename="([^"]*)"/.exec(head)?.[1];
    if (filename !== undefined) {
      const type = /Content-Type:\s*([^\r\n]+)/i.exec(head)?.[1] ?? "application/octet-stream";
      files[filename] = `data:${type};base64,${Buffer.from(content, "latin1").toString("base64")}`;
    } else {
      const v = Buffer.from(content, "latin1").toString("utf8");
      const prev = form[name];
      form[name] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
    }
  }
  return { form, files };
}

const lowerHeaders = (req: http.IncomingMessage): Record<string, string> => {
  const out: Record<string, string> = {};
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const k = req.rawHeaders[i]!.toLowerCase();
    out[k] = out[k] !== undefined && k !== "cookie" ? `${out[k]}, ${req.rawHeaders[i + 1]}` : req.rawHeaders[i + 1]!;
  }
  return out;
};

const DIGEST = { realm: "Users", user: "postman", password: "password" };

export function handler(req: http.IncomingMessage, res: http.ServerResponse, body: Buffer, base: string): void {
  const u = new URL(req.url ?? "/", base);
  const args: Json = {};
  for (const [k, v] of u.searchParams) {
    const prev = args[k];
    args[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  const headers = lowerHeaders(req);
  const send = (code: number, payload: unknown, extra: Record<string, string | string[]> = {}) => {
    const text = typeof payload === "string" ? payload : JSON.stringify(payload);
    res.writeHead(code, { "Content-Type": typeof payload === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8", ...extra });
    res.end(req.method === "HEAD" ? undefined : text);
  };
  const path = u.pathname.replace(/\/+$/, "") || "/";
  const method = req.method ?? "GET";
  let m: RegExpExecArray | null;

  if (path === "/get" || path === "/headers" || path === "/ip") {
    if (path === "/headers") return send(200, { headers });
    if (path === "/ip") return send(200, { ip: req.socket.remoteAddress });
    return send(200, { args, headers, url: u.href });
  }
  if (["/post", "/put", "/patch", "/delete"].includes(path) || path === "/anything" || path.startsWith("/anything/")) {
    const ctype = headers["content-type"] ?? "";
    let data: unknown = "";
    let json: unknown = null;
    let form: Json = {};
    let files: Json = {};
    if (ctype.startsWith("multipart/form-data")) {
      ({ form, files } = parseMultipart(body, /boundary=([^;]+)/.exec(ctype)?.[1] ?? ""));
    } else if (ctype.startsWith("application/x-www-form-urlencoded")) {
      for (const [k, v] of new URLSearchParams(body.toString("utf8"))) {
        const prev = form[k];
        form[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
      }
    } else {
      data = body.toString("utf8");
      try {
        json = JSON.parse(data as string);
        data = json;
      } catch {
        json = null;
      }
    }
    return send(200, { args, data, files, form, headers, json, method, url: u.href });
  }
  if ((m = /^\/status\/(\d{3})$/.exec(path))) return send(Number(m[1]), { status: Number(m[1]) });
  if ((m = /^\/delay\/(\d+(?:\.\d+)?)$/.exec(path))) {
    const ms = Math.min(Number(m[1]) * 1000, 10000);
    setTimeout(() => send(200, { delay: m![1] }), ms);
    return;
  }
  if (path === "/redirect-to") {
    const code = Number(u.searchParams.get("status_code") ?? 302);
    res.writeHead(code, { Location: u.searchParams.get("url") ?? "/get" });
    return void res.end();
  }
  if ((m = /^\/redirect\/(\d+)$/.exec(path))) {
    const n = Number(m[1]);
    res.writeHead(302, { Location: n > 1 ? `/redirect/${n - 1}` : "/get" });
    return void res.end();
  }
  if (path === "/cookies") return send(200, { cookies: parseCookies(headers.cookie) });
  if (path === "/cookies/set") {
    const set = [...u.searchParams].map(([k, v]) => `${k}=${encodeURIComponent(v)}; Path=/`);
    res.writeHead(302, { Location: "/cookies", "Set-Cookie": set });
    return void res.end();
  }
  if (path === "/cookies/delete") {
    const set = [...u.searchParams.keys()].map((k) => `${k}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
    res.writeHead(302, { Location: "/cookies", "Set-Cookie": set });
    return void res.end();
  }
  if (path === "/basic-auth") {
    const ok = headers.authorization === `Basic ${Buffer.from("postman:password").toString("base64")}`;
    return ok ? send(200, { authenticated: true }) : send(401, "Unauthorized", { "WWW-Authenticate": 'Basic realm="Users"' });
  }
  if (path === "/digest-auth") {
    const a = headers.authorization ?? "";
    if (a.startsWith("Digest ")) {
      const f: Record<string, string> = {};
      for (const p of a.slice(7).matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)) f[p[1]!] = p[2] ?? p[3] ?? "";
      const alg = (f.algorithm ?? "MD5").toUpperCase().startsWith("SHA-256") ? "sha256" : "md5";
      const H = (s: string) => createHash(alg).update(s).digest("hex");
      const ha1 = H(`${f.username}:${DIGEST.realm}:${DIGEST.password}`);
      const ha2 = H(`${method}:${f.uri}`);
      const expect = f.qop ? H(`${ha1}:${f.nonce}:${f.nc}:${f.cnonce}:${f.qop}:${ha2}`) : H(`${ha1}:${f.nonce}:${ha2}`);
      if (f.username === DIGEST.user && f.response === expect) return send(200, { authenticated: true });
    }
    return send(401, "Unauthorized", { "WWW-Authenticate": `Digest realm="${DIGEST.realm}", nonce="${randomBytes(8).toString("hex")}", qop="auth"` });
  }
  if (path === "/gzip" || path === "/deflate" || path === "/brotli") {
    const payload = Buffer.from(JSON.stringify({ [path.slice(1)]: true, headers, method }));
    const enc = path === "/gzip" ? "gzip" : path === "/deflate" ? "deflate" : "br";
    const out = enc === "gzip" ? zlib.gzipSync(payload) : enc === "deflate" ? zlib.deflateSync(payload) : zlib.brotliCompressSync(payload);
    res.writeHead(200, { "Content-Type": "application/json", "Content-Encoding": enc });
    return void res.end(out);
  }
  if (path === "/response-headers") {
    const extra: Record<string, string> = {};
    for (const [k, v] of u.searchParams) extra[k] = v;
    return send(200, args, extra);
  }
  if (path === "/encoding/utf8") return send(200, "unicode: \u00e9\u00e8 \u2603 \u{1f600}");
  if (path === "/time/now") return send(200, new Date().toUTCString());
  if (path === "/html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return void res.end("<!doctype html><html><head><title>echo</title></head><body><h1>Hello</h1></body></html>");
  }
  if (path === "/xml") {
    res.writeHead(200, { "Content-Type": "application/xml" });
    return void res.end('<?xml version="1.0"?><note><to>you</to><body>hi</body></note>');
  }
  return send(404, { error: "not found", path });
}

export function startEchoServer(port = 0, host = "127.0.0.1"): Promise<EchoServer> {
  return new Promise((resolve) => {
    let base = "";
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => handler(req, res, Buffer.concat(chunks), base));
    });
    server.listen(port, host, () => {
      const p = (server.address() as AddressInfo).port;
      base = `http://${host}:${p}`;
      resolve({
        url: base,
        port: p,
        close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); }),
      });
    });
  });
}
