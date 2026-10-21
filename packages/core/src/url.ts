import type { QueryParam, Url, UrlObject, Variable } from "./types.js";

const asArray = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

/**
 * Splits a raw URL string into the v2.1 object shape, keeping `{{var}}`
 * references intact (they may contain characters a WHATWG parser rejects).
 */
export function parseUrl(raw: string): UrlObject {
  const out: UrlObject = { raw };
  let rest = raw.trim();
  const hashAt = rest.indexOf("#");
  if (hashAt >= 0) {
    out.hash = rest.slice(hashAt + 1);
    rest = rest.slice(0, hashAt);
  }
  const qAt = rest.indexOf("?");
  let query: string | undefined;
  if (qAt >= 0) {
    query = rest.slice(qAt + 1);
    rest = rest.slice(0, qAt);
  }
  const proto = /^([a-zA-Z][a-zA-Z0-9+.-]*|\{\{[^{}]+\}\}):\/\//.exec(rest);
  if (proto) {
    out.protocol = proto[1];
    rest = rest.slice(proto[0].length);
  }
  const slash = rest.indexOf("/");
  let hostPort = slash >= 0 ? rest.slice(0, slash) : rest;
  const path = slash >= 0 ? rest.slice(slash + 1) : undefined;
  const at = hostPort.lastIndexOf("@");
  if (at >= 0) {
    const info = hostPort.slice(0, at);
    const colon = info.indexOf(":");
    out.auth = colon >= 0 ? { user: info.slice(0, colon), password: info.slice(colon + 1) } : { user: info };
    hostPort = hostPort.slice(at + 1);
  }
  const portM = /:(\d+|\{\{[^{}]+\}\})$/.exec(hostPort);
  if (portM && !hostPort.startsWith("[")) {
    out.port = portM[1];
    hostPort = hostPort.slice(0, portM.index);
  }
  out.host = hostPort.startsWith("{{") && hostPort.endsWith("}}") && !hostPort.slice(2, -2).includes("}}") ? [hostPort] : hostPort.split(".");
  if (path !== undefined) out.path = path.split("/");
  if (query !== undefined) {
    out.query = query.split("&").filter((p) => p.length).map((pair) => {
      const eq = pair.indexOf("=");
      return eq >= 0 ? { key: pair.slice(0, eq), value: pair.slice(eq + 1) } : { key: pair, value: null };
    });
  }
  const vars = asArray(out.path).flatMap((seg) => (typeof seg === "string" && seg.startsWith(":") && seg.length > 1 ? [{ key: seg.slice(1), value: "" }] : []));
  if (vars.length) out.variable = vars;
  return out;
}

export function toUrlObject(url: Url | undefined): UrlObject {
  if (url === undefined) return { raw: "" };
  return typeof url === "string" ? parseUrl(url) : url;
}

export function queryString(query: QueryParam[] | undefined): string {
  return asArray(query)
    .filter((q) => q.disabled !== true)
    .map((q) => (q.value === null || q.value === undefined ? `${q.key ?? ""}` : `${q.key ?? ""}=${q.value}`))
    .join("&");
}

/**
 * Builds the URL string from parts the way the SDK does (raw is only used
 * when no host is present). Path variables (`:id`) are replaced from
 * `variable` when `resolvePathVariables` is set.
 */
export function urlToString(url: Url | undefined, opts: { resolvePathVariables?: boolean } = {}): string {
  if (url === undefined) return "";
  if (typeof url === "string") url = parseUrl(url);
  const host = asArray(url.host);
  if (!host.length) return url.raw ?? "";
  let s = url.protocol ? `${url.protocol}://` : "";
  if (url.auth && (url.auth.user || url.auth.password !== undefined)) {
    s += (url.auth.user ?? "") + (url.auth.password !== undefined ? `:${url.auth.password}` : "") + "@";
  }
  s += host.join(".");
  if (url.port) s += `:${url.port}`;
  const pathVars = new Map<string, unknown>(asArray<Variable>(url.variable).map((v) => [v.key ?? v.id ?? "", v.value]));
  const segs = asArray(url.path).map((seg) => {
    const v = typeof seg === "string" ? seg : seg.value ?? "";
    if (opts.resolvePathVariables && v.startsWith(":") && pathVars.has(v.slice(1))) {
      const val = pathVars.get(v.slice(1));
      return val === undefined || val === null || val === "" ? v : String(val);
    }
    return v;
  });
  if (url.path !== undefined) s += "/" + segs.join("/");
  const q = queryString(url.query);
  if (q || (url.query && url.query.length && !q && url.raw?.includes("?"))) s += q ? `?${q}` : "";
  if (url.hash) s += `#${url.hash}`;
  return s;
}
