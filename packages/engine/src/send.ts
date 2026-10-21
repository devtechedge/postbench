// Node HTTP sender: redirects, cookies, proxies, TLS options, decoding and
// per-phase timings.
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { basename, resolve as resolvePath } from "node:path";
import { randomBytes } from "node:crypto";
import zlib from "node:zlib";
import { CookieJar } from "tough-cookie";
import { applySimpleAuth, getHeader, setHeader } from "./prepare.js";
import { applyAwsV4, applyOAuth1, digestHeader, parseDigestChallenge } from "./auth-node.js";
import type { HeaderEntry, PreparedRequest, ProtocolProfileBehavior, ResponseData, TimingPhases } from "./types.js";

export interface ProxyConfig {
  /** e.g. http://user:pass@proxy:3128 */
  url: string;
  bypass?: string[];
}

export interface SendOptions {
  behavior?: ProtocolProfileBehavior;
  cookieJar?: CookieJar;
  /** Directory used to resolve relative file paths in bodies. */
  workingDir?: string;
  timeout?: number;
  proxy?: ProxyConfig;
  tls?: { ca?: string | Buffer; cert?: string | Buffer; key?: string | Buffer; passphrase?: string; pfx?: Buffer };
  userAgent?: string;
  signal?: AbortSignal;
}

export const DEFAULT_USER_AGENT = "PostbenchRuntime/0.1.0";
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

interface Encoded {
  bytes: Buffer;
  text?: string;
  formPairs?: [string, string][];
}

function guessType(file: string): string {
  const ext = file.split(".").pop()?.toLowerCase();
  return (
    { json: "application/json", txt: "text/plain", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", csv: "text/csv", pdf: "application/pdf", xml: "application/xml", html: "text/html" } as Record<string, string>
  )[ext ?? ""] ?? "application/octet-stream";
}

export function encodeBody(req: PreparedRequest, workingDir = process.cwd()): Encoded {
  const b = req.body;
  switch (b.kind) {
    case "none":
      return { bytes: Buffer.alloc(0) };
    case "text":
      return { bytes: Buffer.from(b.text, "utf8"), text: b.text };
    case "urlencoded":
      return {
        bytes: Buffer.from(b.text, "utf8"),
        text: b.text,
        formPairs: b.text ? b.text.split("&").map((p) => p.split("=").map((s) => decodeURIComponent(s.replace(/\+/g, " "))) as [string, string]) : [],
      };
    case "file": {
      const bytes = b.content !== undefined ? Buffer.from(b.content) : b.src ? readFileSync(resolvePath(workingDir, b.src)) : Buffer.alloc(0);
      return { bytes };
    }
    case "formdata": {
      const boundary = `--------------------------${randomBytes(12).toString("hex")}`;
      const chunks: Buffer[] = [];
      for (const part of b.parts) {
        let head = `--${boundary}\r\nContent-Disposition: form-data; name="${part.name.replace(/"/g, "%22")}"`;
        let content: Buffer;
        if (part.src !== undefined) {
          head += `; filename="${basename(part.src)}"\r\nContent-Type: ${part.contentType || guessType(part.src)}`;
          content = readFileSync(resolvePath(workingDir, part.src));
        } else {
          if (part.contentType) head += `\r\nContent-Type: ${part.contentType}`;
          content = Buffer.from(part.value ?? "", "utf8");
        }
        chunks.push(Buffer.from(head + "\r\n\r\n"), content, Buffer.from("\r\n"));
      }
      chunks.push(Buffer.from(`--${boundary}--\r\n`));
      setHeader(req.headers, "Content-Type", `multipart/form-data; boundary=${boundary}`);
      return { bytes: Buffer.concat(chunks) };
    }
  }
}

function decode(body: Buffer, encoding: string | undefined): Buffer {
  try {
    switch ((encoding ?? "").trim().toLowerCase()) {
      case "gzip":
      case "x-gzip":
        return zlib.gunzipSync(body, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
      case "deflate":
        try {
          return zlib.inflateSync(body);
        } catch {
          return zlib.inflateRawSync(body);
        }
      case "br":
        return zlib.brotliDecompressSync(body);
      default:
        return body;
    }
  } catch {
    return body;
  }
}

function bypassed(host: string, bypass: string[] = []): boolean {
  return bypass.some((b) => b === "*" || host === b || (b.startsWith(".") && host.endsWith(b)) || host.endsWith(`.${b}`));
}

interface RawResponse {
  code: number;
  status: string;
  headers: HeaderEntry[];
  rawHeaders: http.IncomingHttpHeaders;
  body: Buffer;
  wireSize: number;
  t: { start: number; socket?: number; lookup?: number; connect?: number; secureConnect?: number; response?: number; end: number };
}

function once(req: PreparedRequest, bytes: Buffer, opts: SendOptions): Promise<RawResponse> {
  return new Promise((resolveP, reject) => {
    const u = new URL(req.url);
    const isHttps = u.protocol === "https:";
    const start = performance.now();
    const t: RawResponse["t"] = { start: 0, end: 0 };
    const mark = (k: keyof RawResponse["t"]) => {
      if (t[k] === undefined || k === "end") (t as Record<string, number>)[k] = performance.now() - start;
    };
    const headers: Record<string, string | string[]> = {};
    for (const h of req.headers) {
      const existing = Object.keys(headers).find((k) => k.toLowerCase() === h.key.toLowerCase());
      if (existing && h.key.toLowerCase() !== "cookie") {
        const cur = headers[existing]!;
        headers[existing] = Array.isArray(cur) ? [...cur, h.value] : [cur, h.value];
      } else if (existing) headers[existing] = `${headers[existing]}; ${h.value}`;
      else headers[h.key] = h.value;
    }
    if (bytes.length || !["GET", "HEAD", "OPTIONS", "DELETE"].includes(req.method)) headers["Content-Length"] = String(bytes.length);
    const proxy = opts.proxy && !bypassed(u.hostname, opts.proxy.bypass) ? new URL(opts.proxy.url) : undefined;
    const strict = opts.behavior?.strictSSL !== false;
    const tlsOpts = { rejectUnauthorized: strict, ca: opts.tls?.ca, cert: opts.tls?.cert, key: opts.tls?.key, passphrase: opts.tls?.passphrase, pfx: opts.tls?.pfx, servername: net.isIP(u.hostname) ? undefined : u.hostname };
    const reqOpts: https.RequestOptions = {
      method: req.method,
      headers,
      insecureHTTPParser: opts.behavior?.insecureHTTPParser === true,
      agent: false,
    };
    const proxyAuth = proxy && proxy.username ? `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}` : undefined;

    const onResponse = (res: http.IncomingMessage) => {
      mark("response");
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("error", reject);
      res.on("end", () => {
        mark("end");
        const wire = Buffer.concat(chunks);
        const list: HeaderEntry[] = [];
        for (let i = 0; i < res.rawHeaders.length; i += 2) list.push({ key: res.rawHeaders[i]!, value: res.rawHeaders[i + 1]! });
        resolveP({
          code: res.statusCode ?? 0,
          status: res.statusMessage ?? "",
          headers: list,
          rawHeaders: res.headers,
          body: decode(wire, res.headers["content-encoding"] as string | undefined),
          wireSize: wire.length,
          t,
        });
      });
    };

    const hookSocket = (sock: net.Socket) => {
      mark("socket");
      sock.once("lookup", () => mark("lookup"));
      sock.once("connect", () => mark("connect"));
      sock.once("secureConnect", () => mark("secureConnect"));
    };

    let r: http.ClientRequest;
    if (proxy && !isHttps) {
      // Plain HTTP through a proxy: absolute-form request target.
      if (proxyAuth) headers["Proxy-Authorization"] = proxyAuth;
      r = http.request({ ...reqOpts, host: proxy.hostname, port: Number(proxy.port || 80), path: u.href }, onResponse);
    } else if (proxy && isHttps) {
      // HTTPS through a proxy: CONNECT tunnel, then TLS over it.
      const connectReq = http.request({ host: proxy.hostname, port: Number(proxy.port || 80), method: "CONNECT", path: `${u.hostname}:${u.port || 443}`, headers: proxyAuth ? { "Proxy-Authorization": proxyAuth } : {} });
      connectReq.on("connect", (res, socket) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Proxy CONNECT failed with ${res.statusCode}`));
          return;
        }
        const secure = tls.connect({ ...tlsOpts, socket });
        const inner = https.request({ ...reqOpts, host: u.hostname, port: u.port || 443, path: u.pathname + u.search, createConnection: () => secure }, onResponse);
        inner.on("error", reject);
        hookSocket(secure);
        inner.end(bytes);
      });
      connectReq.on("error", reject);
      connectReq.end();
      return;
    } else {
      const mod = isHttps ? https : http;
      r = mod.request({ ...reqOpts, ...(isHttps ? tlsOpts : {}), protocol: u.protocol, hostname: u.hostname.replace(/^\[|\]$/g, ""), port: u.port || (isHttps ? 443 : 80), path: u.pathname + u.search }, onResponse);
    }
    if (opts.timeout) {
      // A wall-clock timer covers DNS and connect, which socket idle
      // timeouts do not.
      const timer = setTimeout(() => r.destroy(new Error(`ETIMEDOUT: request timed out after ${opts.timeout}ms`)), opts.timeout);
      const clear = () => clearTimeout(timer);
      r.on("close", clear);
      r.on("error", clear);
    }
    if (opts.signal) opts.signal.addEventListener("abort", () => r.destroy(new Error("aborted")), { once: true });
    r.on("socket", hookSocket);
    r.on("error", reject);
    r.end(bytes);
  });
}

function phases(t: RawResponse["t"]): TimingPhases {
  const socket = t.socket ?? 0;
  const lookup = t.lookup ?? socket;
  const connect = t.connect ?? lookup;
  const secure = t.secureConnect ?? connect;
  const response = t.response ?? t.end;
  const r = (n: number) => Math.max(0, Math.round(n * 100) / 100);
  return { wait: r(socket), dns: r(lookup - socket), tcp: r(connect - lookup), secureHandshake: r(secure - connect), firstByte: r(response - secure), download: r(t.end - response), total: r(t.end) };
}

/** Adds the default headers Postman-style clients send when absent. */
export function addDefaultHeaders(req: PreparedRequest, userAgent = DEFAULT_USER_AGENT): void {
  setHeader(req.headers, "User-Agent", userAgent, false);
  setHeader(req.headers, "Accept", "*/*", false);
  setHeader(req.headers, "Accept-Encoding", "gzip, deflate, br", false);
  setHeader(req.headers, "Connection", "close", false);
}

/** Sends a prepared request, applying auth, cookies and redirect handling. */
export async function send(input: PreparedRequest, opts: SendOptions = {}): Promise<ResponseData> {
  const req: PreparedRequest = { ...input, headers: input.headers.map((h) => ({ ...h })) };
  const behavior = opts.behavior ?? {};
  addDefaultHeaders(req, opts.userAgent);
  const enc = encodeBody(req, opts.workingDir);
  const authType = req.auth?.type;
  if (!applySimpleAuth(req)) {
    if (authType === "awsv4") applyAwsV4(req, enc.text ?? enc.bytes.toString("utf8"));
    else if (authType === "oauth1") applyOAuth1(req, enc.formPairs);
  }

  const jar = behavior.disableCookies ? undefined : opts.cookieJar;
  const redirects: { url: string; code: number }[] = [];
  const maxRedirects = behavior.maxRedirects ?? 10;
  const follow = behavior.followRedirects !== false;
  let current = req;
  let bytes = enc.bytes;
  let digestTried = false;
  const started = performance.now();
  let totalSize = 0;
  for (;;) {
    if (jar) {
      const cookie = await jar.getCookieString(current.url);
      if (cookie && getHeader(current.headers, "cookie") === undefined) current.headers.push({ key: "Cookie", value: cookie });
    }
    const res = await once(current, bytes, { ...opts, behavior });
    totalSize += res.wireSize;
    const setCookies = res.rawHeaders["set-cookie"] ?? [];
    if (jar) for (const c of setCookies) await jar.setCookie(c, current.url, { ignoreError: true });

    if (res.code === 401 && authType === "digest" && !digestTried) {
      const challenge = parseDigestChallenge(String(res.rawHeaders["www-authenticate"] ?? ""));
      if (challenge) {
        digestTried = true;
        setHeader(current.headers, "Authorization", digestHeader(current, challenge, enc.text ?? ""));
        current.headers = current.headers.filter((h) => h.key.toLowerCase() !== "cookie");
        continue;
      }
    }

    const location = res.rawHeaders.location;
    if (follow && REDIRECT_CODES.has(res.code) && location && redirects.length < maxRedirects) {
      const next = new URL(String(location), current.url).href;
      redirects.push({ url: current.url, code: res.code });
      const keepMethod = res.code === 307 || res.code === 308 || behavior.followOriginalHttpMethod === true;
      const crossOrigin = new URL(next).origin !== new URL(current.url).origin;
      let headers = current.headers.filter((h) => h.key.toLowerCase() !== "cookie" && h.key.toLowerCase() !== "host");
      if (crossOrigin && !behavior.followAuthorizationHeader) headers = headers.filter((h) => h.key.toLowerCase() !== "authorization");
      if (!behavior.removeRefererHeaderOnRedirect) setHeader(headers, "Referer", current.url);
      if (!keepMethod && current.method !== "HEAD") {
        headers = headers.filter((h) => !/^content-(type|length)$/i.test(h.key));
        current = { ...current, method: "GET", url: next, headers, body: { kind: "none" } };
        bytes = Buffer.alloc(0);
      } else current = { ...current, url: next, headers };
      continue;
    }

    const cookies = jar
      ? (await jar.getCookies(current.url)).map((c) => ({
          name: c.key,
          value: c.value,
          domain: c.domain ?? undefined,
          path: c.path ?? undefined,
          expires: c.expires instanceof Date ? c.expires.toISOString() : undefined,
          httpOnly: c.httpOnly,
          secure: c.secure,
        }))
      : [];
    const p = phases(res.t);
    return {
      code: res.code,
      status: res.status,
      headers: res.headers,
      body: new Uint8Array(res.body),
      responseTime: Math.round(performance.now() - started),
      responseSize: totalSize,
      timings: p,
      url: current.url,
      redirects,
      cookies,
    };
  }
}

export { CookieJar };
