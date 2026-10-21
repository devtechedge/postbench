// Browser-safe request preparation: variable substitution, URL building,
// header and body assembly and the auth helpers that need no crypto.
import type { Auth, AuthAttribute, Body, Header, Item, ItemGroup, RequestObject } from "@postbench/core";
import { VariableResolver, toUrlObject, urlToString } from "@postbench/core";
import type { FormPart, HeaderEntry, PreparedBody, PreparedRequest, ProtocolProfileBehavior } from "./types.js";

/** Methods whose body is dropped unless disableBodyPruning is set. */
export const BODY_PRUNED_METHODS = new Set(["GET", "HEAD", "COPY", "PURGE", "UNLOCK"]);

export function authParams(auth: Auth | null | undefined): Record<string, unknown> {
  if (!auth || auth.type === "noauth") return {};
  const list = auth[auth.type];
  if (!Array.isArray(list)) return typeof list === "object" && list ? (list as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const a of list as AuthAttribute[]) out[a.key] = a.value;
  return out;
}

/**
 * Auth inheritance: the item's own auth wins; `null`/missing inherits from
 * the nearest folder, then the collection. An explicit `noauth` stops it.
 */
export function effectiveAuth(request: RequestObject, parents: ItemGroup[], collectionAuth?: Auth | null): Auth | null {
  if (request.auth && (request.auth as Auth).type) return request.auth as Auth;
  for (let i = parents.length - 1; i >= 0; i--) {
    const a = parents[i]!.auth;
    if (a && a.type) return a;
  }
  return collectionAuth && collectionAuth.type ? collectionAuth : null;
}

/** protocolProfileBehavior merges collection < folders < item. */
export function effectiveBehavior(item: Item, parents: ItemGroup[], collection?: { protocolProfileBehavior?: Record<string, unknown> }): ProtocolProfileBehavior {
  return Object.assign({}, collection?.protocolProfileBehavior, ...parents.map((p) => p.protocolProfileBehavior ?? {}), item.protocolProfileBehavior ?? {});
}

const headerList = (h: Header[] | string | undefined): Header[] => {
  if (!h) return [];
  if (typeof h === "string") {
    return h.split(/\r?\n/).filter(Boolean).map((line) => {
      const i = line.indexOf(":");
      return { key: line.slice(0, i).trim(), value: line.slice(i + 1).trim() };
    });
  }
  return h;
};

export const getHeader = (headers: HeaderEntry[], key: string) => headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;
export function setHeader(headers: HeaderEntry[], key: string, value: string, overwrite = true): void {
  const i = headers.findIndex((h) => h.key.toLowerCase() === key.toLowerCase());
  if (i >= 0) {
    if (overwrite) headers[i] = { key: headers[i]!.key, value };
  } else headers.push({ key, value });
}

const RAW_LANGUAGE_TYPES: Record<string, string> = {
  json: "application/json",
  xml: "application/xml",
  html: "text/html",
  text: "text/plain",
  javascript: "application/javascript",
};

function encodeForm(pairs: [string, string][]): string {
  const enc = (s: string) => encodeURIComponent(s).replace(/%20/g, "+");
  return pairs.map(([k, v]) => `${enc(k)}=${enc(v)}`).join("&");
}

function prepareBody(body: Body | null | undefined, r: VariableResolver, headers: HeaderEntry[]): PreparedBody {
  if (!body || body.disabled || !body.mode) return { kind: "none" };
  switch (body.mode) {
    case "raw": {
      const text = r.replaceIn(body.raw ?? "");
      const lang = body.options?.raw?.language;
      if (lang && RAW_LANGUAGE_TYPES[lang]) setHeader(headers, "Content-Type", RAW_LANGUAGE_TYPES[lang]!, false);
      else if (text) setHeader(headers, "Content-Type", "text/plain", false);
      return { kind: "text", text };
    }
    case "graphql": {
      let variables: unknown = undefined;
      const v = r.replaceIn(body.graphql?.variables ?? "");
      if (v.trim()) {
        try {
          variables = JSON.parse(v);
        } catch {
          variables = undefined;
        }
      }
      setHeader(headers, "Content-Type", "application/json", false);
      return { kind: "text", text: JSON.stringify({ query: r.replaceIn(body.graphql?.query ?? ""), variables }) };
    }
    case "urlencoded": {
      setHeader(headers, "Content-Type", "application/x-www-form-urlencoded", false);
      const pairs = (body.urlencoded ?? []).filter((p) => !p.disabled).map((p) => [r.replaceIn(p.key), r.replaceIn(p.value ?? "")] as [string, string]);
      return { kind: "urlencoded", text: encodeForm(pairs) };
    }
    case "formdata": {
      const parts = (body.formdata ?? []).filter((p) => !p.disabled).flatMap((p): FormPart[] => {
        const name = r.replaceIn(p.key);
        if (p.type === "file") {
          const srcs = Array.isArray(p.src) ? p.src : p.src ? [p.src] : [];
          return srcs.map((src) => ({ name, src, contentType: p.contentType }));
        }
        return [{ name, value: r.replaceIn(p.value ?? ""), contentType: p.contentType }];
      });
      return { kind: "formdata", parts };
    }
    case "file":
      return { kind: "file", src: body.file?.src ?? undefined, content: body.file?.content };
    default:
      return { kind: "none" };
  }
}

const b64 = (s: string) => {
  const g = globalThis as { Buffer?: { from(s: string, e: string): { toString(e: string): string } }; btoa?: (s: string) => string };
  if (g.Buffer) return g.Buffer.from(s, "utf8").toString("base64");
  return g.btoa!(unescape(encodeURIComponent(s)));
};

/**
 * Applies auth types that need no crypto. Returns false when the type needs
 * the Node sender (digest, awsv4, oauth1, ...).
 */
export function applySimpleAuth(req: PreparedRequest): boolean {
  const auth = req.auth;
  if (!auth || auth.type === "noauth") return true;
  const p = authParams(auth);
  const str = (k: string) => (p[k] === undefined || p[k] === null ? "" : String(p[k]));
  switch (auth.type) {
    case "basic":
      setHeader(req.headers, "Authorization", `Basic ${b64(`${str("username")}:${str("password")}`)}`);
      return true;
    case "bearer":
      setHeader(req.headers, "Authorization", `Bearer ${str("token")}`);
      return true;
    case "apikey": {
      const key = str("key");
      if (!key.trim()) return true;
      if (str("in") === "query") {
        const sep = req.url.includes("?") ? "&" : "?";
        req.url += `${sep}${encodeURIComponent(key)}=${encodeURIComponent(str("value"))}`;
      } else setHeader(req.headers, key, str("value"));
      return true;
    }
    case "oauth2": {
      const token = str("accessToken");
      if (!token) return true;
      if (str("addTokenTo") === "queryParams") {
        const sep = req.url.includes("?") ? "&" : "?";
        req.url += `${sep}access_token=${encodeURIComponent(token)}`;
      } else setHeader(req.headers, "Authorization", `${str("headerPrefix") || "Bearer"} ${token}`);
      return true;
    }
    default:
      return false;
  }
}

export interface PrepareOptions {
  resolver: VariableResolver;
  parents?: ItemGroup[];
  collectionAuth?: Auth | null;
  behavior?: ProtocolProfileBehavior;
}

/** Resolves an item's request into a PreparedRequest. */
export function prepareRequest(request: RequestObject | string, opts: PrepareOptions): PreparedRequest {
  const req: RequestObject = typeof request === "string" ? { url: request, method: "GET" } : request;
  const r = opts.resolver;
  const url = toUrlObject(req.url);
  const resolvedUrl = r.replaceInObject({ ...url, raw: undefined });
  let urlString = urlToString(resolvedUrl, { resolvePathVariables: true });
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(urlString) && urlString) urlString = `http://${urlString}`;
  const method = (r.replaceIn(req.method ?? "GET") || "GET").toUpperCase();
  const headers: HeaderEntry[] = headerList(req.header as Header[] | string | undefined)
    .filter((h) => !h.disabled && h.key)
    .map((h) => ({ key: r.replaceIn(h.key), value: r.replaceIn(h.value ?? "") }));
  const pruned = BODY_PRUNED_METHODS.has(method) && !opts.behavior?.disableBodyPruning;
  const body: PreparedBody = pruned ? { kind: "none" } : prepareBody(req.body, r, headers);
  const auth = effectiveAuth(req, opts.parents ?? [], opts.collectionAuth);
  const resolvedAuth = auth ? (r.replaceInObject(auth) as Auth) : null;
  return { method, url: urlString, headers, body, auth: resolvedAuth };
}
