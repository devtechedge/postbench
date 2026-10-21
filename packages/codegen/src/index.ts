// Code snippet generators. Input is a PreparedRequest (variables already
// substituted). Simple auth types are folded into headers first.
import { applySimpleAuth, type PreparedRequest } from "@postbench/engine/prepare";

export type Language = "curl" | "javascript-fetch" | "python-requests" | "httpie";

export const languages: { id: Language; label: string; syntax: string }[] = [
  { id: "curl", label: "cURL", syntax: "bash" },
  { id: "javascript-fetch", label: "JavaScript (fetch)", syntax: "javascript" },
  { id: "python-requests", label: "Python (requests)", syntax: "python" },
  { id: "httpie", label: "HTTPie", syntax: "bash" },
];

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const js = (s: string) => JSON.stringify(s);
const py = (s: string) => JSON.stringify(s);

function withAuth(req: PreparedRequest): PreparedRequest {
  const copy: PreparedRequest = { ...req, headers: req.headers.map((h) => ({ ...h })) };
  applySimpleAuth(copy);
  return copy;
}

export function curl(input: PreparedRequest): string {
  const r = withAuth(input);
  const parts = [`curl --location${r.method === "GET" ? "" : ` --request ${r.method}`} ${sq(r.url)}`];
  for (const h of r.headers) parts.push(`--header ${sq(`${h.key}: ${h.value}`)}`);
  const b = r.body;
  if (b.kind === "text") parts.push(`--data-raw ${sq(b.text)}`);
  else if (b.kind === "urlencoded") for (const pair of b.text.split("&").filter(Boolean)) parts.push(`--data-urlencode ${sq(decodeURIComponent(pair.replace(/\+/g, " ")))}`);
  else if (b.kind === "formdata") for (const p of b.parts) parts.push(`--form ${sq(p.src !== undefined ? `${p.name}=@"${p.src}"` : `${p.name}="${p.value ?? ""}"`)}`);
  else if (b.kind === "file") parts.push(b.src ? `--data-binary ${sq(`@${b.src}`)}` : `--data-binary ${sq(b.content ?? "")}`);
  return parts.join(" \\\n");
}

export function fetchSnippet(input: PreparedRequest): string {
  const r = withAuth(input);
  const lines: string[] = [];
  const b = r.body;
  if (r.headers.length) {
    lines.push("const headers = new Headers();");
    for (const h of r.headers) if (!(b.kind === "formdata" && /^content-type$/i.test(h.key))) lines.push(`headers.append(${js(h.key)}, ${js(h.value)});`);
    lines.push("");
  }
  let bodyExpr: string | undefined;
  if (b.kind === "text") {
    lines.push(`const body = ${js(b.text)};`, "");
    bodyExpr = "body";
  } else if (b.kind === "urlencoded") {
    lines.push("const body = new URLSearchParams();");
    for (const [k, v] of new URLSearchParams(b.text)) lines.push(`body.append(${js(k)}, ${js(v)});`);
    lines.push("");
    bodyExpr = "body";
  } else if (b.kind === "formdata") {
    lines.push("const body = new FormData();");
    for (const p of b.parts) lines.push(p.src !== undefined ? `body.append(${js(p.name)}, fileInput.files[0], ${js(p.src)});` : `body.append(${js(p.name)}, ${js(p.value ?? "")});`);
    lines.push("");
    bodyExpr = "body";
  } else if (b.kind === "file") {
    lines.push(`const body = ${b.src ? "fileInput.files[0]" : js(b.content ?? "")};`, "");
    bodyExpr = "body";
  }
  const opts = [`  method: ${js(r.method)},`];
  if (r.headers.length) opts.push("  headers,");
  if (bodyExpr) opts.push(`  body: ${bodyExpr},`);
  opts.push(`  redirect: "follow",`);
  lines.push(`const response = await fetch(${js(r.url)}, {`, ...opts, "});", "console.log(await response.text());");
  return lines.join("\n");
}

export function pythonRequests(input: PreparedRequest): string {
  const r = withAuth(input);
  const b = r.body;
  const lines = ["import requests", "", `url = ${py(r.url)}`];
  const headers = r.headers.filter((h) => !(b.kind === "formdata" && /^content-type$/i.test(h.key)));
  lines.push(headers.length ? `headers = {\n${headers.map((h) => `    ${py(h.key)}: ${py(h.value)},`).join("\n")}\n}` : "headers = {}");
  const args = ["url", "headers=headers"];
  if (b.kind === "text") {
    lines.push(`payload = ${py(b.text)}`);
    args.push("data=payload.encode(\"utf-8\")");
  } else if (b.kind === "urlencoded") {
    lines.push(`payload = ${py(b.text)}`);
    args.push("data=payload");
  } else if (b.kind === "formdata") {
    const text = b.parts.filter((p) => p.src === undefined);
    const files = b.parts.filter((p) => p.src !== undefined);
    lines.push(`payload = {${text.map((p) => `${py(p.name)}: ${py(p.value ?? "")}`).join(", ")}}`);
    lines.push(`files = [${files.map((p) => `(${py(p.name)}, open(${py(p.src!)}, "rb"))`).join(", ")}]`);
    args.push("data=payload", "files=files");
  } else if (b.kind === "file") {
    lines.push(b.src ? `payload = open(${py(b.src)}, "rb")` : `payload = ${py(b.content ?? "")}`);
    args.push("data=payload");
  }
  lines.push("", `response = requests.request(${py(r.method)}, ${args.join(", ")})`, "", "print(response.text)");
  return lines.join("\n");
}

export function httpie(input: PreparedRequest): string {
  const r = withAuth(input);
  const b = r.body;
  const parts = [`http --follow ${r.method} ${sq(r.url)}`];
  for (const h of r.headers) parts.push(sq(`${h.key}:${h.value}`));
  if (b.kind === "urlencoded") {
    parts[0] = parts[0]!.replace("http --follow", "http --follow --form");
    for (const [k, v] of new URLSearchParams(b.text)) parts.push(sq(`${k}=${v}`));
  } else if (b.kind === "formdata") {
    parts[0] = parts[0]!.replace("http --follow", "http --follow --multipart");
    for (const p of b.parts) parts.push(sq(p.src !== undefined ? `${p.name}@${p.src}` : `${p.name}=${p.value ?? ""}`));
  }
  const cmd = parts.join(" \\\n  ");
  if (b.kind === "text") return `printf %s ${sq(b.text)} | ${cmd}`;
  if (b.kind === "file" && b.src) return `${cmd} < ${sq(b.src)}`;
  return cmd;
}

export function generate(language: Language, req: PreparedRequest): string {
  switch (language) {
    case "curl":
      return curl(req);
    case "javascript-fetch":
      return fetchSnippet(req);
    case "python-requests":
      return pythonRequests(req);
    case "httpie":
      return httpie(req);
  }
}
