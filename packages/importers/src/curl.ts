import type { Body, Header, Item } from "@postbench/core";

/** Shell-like tokenizer: single and double quotes, backslash escapes and line continuations. */
export function tokenize(cmd: string): string[] {
  const out: string[] = [];
  let cur = "";
  let has = false;
  let q: "'" | '"' | null = null;
  const s = cmd.replace(/\\\r?\n/g, " ");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q === "'") {
      if (c === "'") q = null;
      else cur += c;
    } else if (q === '"') {
      if (c === '"') q = null;
      else if (c === "\\" && i + 1 < s.length && '"\\$`'.includes(s[i + 1]!)) cur += s[++i];
      else cur += c;
    } else if (c === "'" || c === '"') {
      q = c;
      has = true;
    } else if (c === "\\" && i + 1 < s.length) {
      cur += s[++i];
      has = true;
    } else if (/\s/.test(c)) {
      if (cur || has) out.push(cur);
      cur = "";
      has = false;
    } else cur += c;
  }
  if (cur || has) out.push(cur);
  return out;
}

/** Converts a curl command line into a request item. */
export function importCurl(cmd: string): Item {
  const t = tokenize(cmd.trim());
  if (t[0] !== "curl") throw new Error("Not a curl command");
  let method: string | undefined;
  let url = "";
  const header: Header[] = [];
  const data: string[] = [];
  const form: { key: string; value?: string; src?: string; type: "text" | "file" }[] = [];
  let urlencode = false;
  let user: string | undefined;
  let get = false;
  for (let i = 1; i < t.length; i++) {
    const a = t[i]!;
    const next = () => t[++i] ?? "";
    if (a === "-X" || a === "--request") method = next().toUpperCase();
    else if (a === "-H" || a === "--header") {
      const h = next();
      const k = h.indexOf(":");
      header.push({ key: h.slice(0, k).trim(), value: h.slice(k + 1).trim() });
    } else if (["-d", "--data", "--data-raw", "--data-binary", "--data-ascii"].includes(a)) data.push(next());
    else if (a === "--data-urlencode") {
      urlencode = true;
      data.push(next());
    } else if (a === "-F" || a === "--form") {
      const f = next();
      const eq = f.indexOf("=");
      const key = f.slice(0, eq);
      const v = f.slice(eq + 1);
      if (v.startsWith("@")) form.push({ key, src: v.slice(1).replace(/^"|"$/g, ""), type: "file" });
      else form.push({ key, value: v.replace(/^"|"$/g, ""), type: "text" });
    } else if (a === "-u" || a === "--user") user = next();
    else if (a === "-G" || a === "--get") get = true;
    else if (a === "--url") url = next();
    else if (a === "-A" || a === "--user-agent") header.push({ key: "User-Agent", value: next() });
    else if (a === "-b" || a === "--cookie") header.push({ key: "Cookie", value: next() });
    else if (a === "-e" || a === "--referer") header.push({ key: "Referer", value: next() });
    else if (["-o", "--output", "-w", "--write-out", "--max-time", "-m", "--connect-timeout"].includes(a)) next();
    else if (!a.startsWith("-") && !url) url = a;
  }
  let body: Body | undefined;
  if (get && data.length) {
    url += (url.includes("?") ? "&" : "?") + data.join("&");
  } else if (form.length) body = { mode: "formdata", formdata: form };
  else if (data.length) {
    const ct = header.find((h) => h.key.toLowerCase() === "content-type")?.value ?? "";
    if (urlencode || ct.includes("x-www-form-urlencoded") || (!ct && data.every((d) => /^[^=&\s{[]+=/.test(d)))) {
      body = { mode: "urlencoded", urlencoded: data.join("&").split("&").map((p) => { const e = p.indexOf("="); return { key: e < 0 ? p : p.slice(0, e), value: e < 0 ? "" : p.slice(e + 1) }; }) };
    } else body = { mode: "raw", raw: data.join("&"), ...(ct.includes("json") ? { options: { raw: { language: "json" } } } : {}) };
  }
  const m = method ?? (body && !get ? "POST" : "GET");
  const item: Item = { name: url, request: { method: m, header, url, ...(body ? { body } : {}) } };
  if (user !== undefined) {
    const [u, p = ""] = user.split(/:(.*)/s);
    (item.request as { auth?: unknown }).auth = { type: "basic", basic: [{ key: "username", value: u }, { key: "password", value: p }] };
  }
  return item;
}
