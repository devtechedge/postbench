// Auth helpers that need Node crypto.
import { createHash, createHmac, randomBytes } from "node:crypto";
import aws4 from "aws4";
import { authParams, getHeader, setHeader } from "./prepare.js";
import type { PreparedRequest } from "./types.js";

const str = (p: Record<string, unknown>, k: string) => (p[k] === undefined || p[k] === null ? "" : String(p[k]));

export function applyAwsV4(req: PreparedRequest, bodyText: string | undefined): void {
  const p = authParams(req.auth);
  const u = new URL(req.url);
  const headers: Record<string, string> = {};
  for (const h of req.headers) headers[h.key] = h.value;
  const opts = {
    host: u.host,
    path: u.pathname + u.search,
    method: req.method,
    headers,
    body: bodyText,
    service: str(p, "service") || "execute-api",
    region: str(p, "region") || "us-east-1",
  };
  aws4.sign(opts, {
    accessKeyId: str(p, "accessKey"),
    secretAccessKey: str(p, "secretKey"),
    sessionToken: str(p, "sessionToken") || undefined,
  });
  for (const [k, v] of Object.entries(opts.headers)) if (k.toLowerCase() !== "host") setHeader(req.headers, k, String(v));
}

/** Parses a `WWW-Authenticate: Digest ...` challenge. */
export function parseDigestChallenge(header: string): Record<string, string> | undefined {
  const m = /^\s*Digest\s+(.*)$/i.exec(header);
  if (!m) return undefined;
  const out: Record<string, string> = {};
  for (const part of m[1]!.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]*))/g)) out[part[1]!.toLowerCase()] = part[2] ?? part[3] ?? "";
  return out;
}

const hashFor = (algorithm: string) => (algorithm.toUpperCase().startsWith("SHA-256") ? "sha256" : "md5");
const H = (alg: string, s: string) => createHash(alg).update(s).digest("hex");

/**
 * Builds a Digest Authorization header (RFC 7616: MD5, MD5-sess, SHA-256,
 * SHA-256-sess; qop auth and auth-int). Uses the nonce counter 00000001,
 * like the runtime (fact digest-qop).
 */
export function digestHeader(req: PreparedRequest, challenge: Record<string, string>, body = "", cnonce = randomBytes(8).toString("hex")): string {
  const p = authParams(req.auth);
  const username = str(p, "username");
  const password = str(p, "password");
  const realm = challenge.realm ?? str(p, "realm");
  const nonce = challenge.nonce ?? str(p, "nonce");
  const algorithm = challenge.algorithm ?? (str(p, "algorithm") || "MD5");
  const qopOffered = (challenge.qop ?? str(p, "qop")).split(",").map((s) => s.trim()).filter(Boolean);
  const qop = qopOffered.includes("auth") ? "auth" : qopOffered.includes("auth-int") ? "auth-int" : "";
  const opaque = challenge.opaque ?? str(p, "opaque");
  const alg = hashFor(algorithm);
  const u = new URL(req.url);
  const uri = u.pathname + u.search;
  const nc = "00000001";
  let ha1 = H(alg, `${username}:${realm}:${password}`);
  if (/-sess$/i.test(algorithm)) ha1 = H(alg, `${ha1}:${nonce}:${cnonce}`);
  const ha2 = qop === "auth-int" ? H(alg, `${req.method}:${uri}:${H(alg, body)}`) : H(alg, `${req.method}:${uri}`);
  const response = qop ? H(alg, `${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : H(alg, `${ha1}:${nonce}:${ha2}`);
  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `algorithm="${algorithm}"`,
  ];
  if (qop) parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  parts.push(`response="${response}"`);
  if (opaque) parts.push(`opaque="${opaque}"`);
  return `Digest ${parts.join(", ")}`;
}

const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** OAuth 1.0a signing (HMAC-SHA1, HMAC-SHA256, PLAINTEXT) into the header. */
export function applyOAuth1(req: PreparedRequest, formPairs: [string, string][] = [], fixed?: { nonce: string; timestamp: string }): void {
  const p = authParams(req.auth);
  const method = str(p, "signatureMethod") || "HMAC-SHA1";
  const oauth: Record<string, string> = {
    oauth_consumer_key: str(p, "consumerKey"),
    oauth_nonce: fixed?.nonce ?? (str(p, "nonce") || randomBytes(6).toString("hex")),
    oauth_signature_method: method,
    oauth_timestamp: fixed?.timestamp ?? (str(p, "timestamp") || String(Math.floor(Date.now() / 1000))),
    oauth_version: str(p, "version") || "1.0",
  };
  if (str(p, "token")) oauth.oauth_token = str(p, "token");
  if (str(p, "callback")) oauth.oauth_callback = str(p, "callback");
  if (str(p, "verifier")) oauth.oauth_verifier = str(p, "verifier");
  const u = new URL(req.url);
  const params: [string, string][] = [...u.searchParams.entries(), ...formPairs, ...Object.entries(oauth)];
  const norm = params.map(([k, v]) => [rfc3986(k), rfc3986(v)] as const).sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("&");
  const base = [req.method.toUpperCase(), rfc3986(`${u.protocol}//${u.host}${u.pathname}`), rfc3986(norm)].join("&");
  const key = `${rfc3986(str(p, "consumerSecret"))}&${rfc3986(str(p, "tokenSecret"))}`;
  let signature: string;
  if (method === "PLAINTEXT") signature = key;
  else signature = createHmac(method === "HMAC-SHA256" ? "sha256" : "sha1", key).update(base).digest("base64");
  oauth.oauth_signature = signature;
  const realm = str(p, "realm");
  const header = (realm ? [`realm="${realm}"`] : []).concat(Object.entries(oauth).map(([k, v]) => `${k}="${rfc3986(v)}"`)).join(",");
  setHeader(req.headers, "Authorization", `OAuth ${header}`);
}

export const hasAuthorization = (req: PreparedRequest) => getHeader(req.headers, "authorization") !== undefined;
