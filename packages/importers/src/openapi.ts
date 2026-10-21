import type { Collection, Item, ItemGroup, Variable } from "@postbench/core";
import { SCHEMA_V21 } from "@postbench/core";
import { parse as parseYaml } from "yaml";

type Obj = Record<string, any>;
const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

function deref(doc: Obj, o: any, seen = new Set<string>()): any {
  if (!o || typeof o !== "object") return o;
  if (typeof o.$ref === "string" && o.$ref.startsWith("#/")) {
    if (seen.has(o.$ref)) return {};
    const target = o.$ref.slice(2).split("/").reduce((a: any, k: string) => a?.[k.replace(/~1/g, "/").replace(/~0/g, "~")], doc);
    return deref(doc, target, new Set([...seen, o.$ref]));
  }
  return o;
}

/** Builds an example value from a JSON schema. */
export function sample(doc: Obj, schema: any, depth = 0): unknown {
  const s = deref(doc, schema);
  if (!s || depth > 6) return null;
  if (s.example !== undefined) return s.example;
  if (s.default !== undefined) return s.default;
  if (s.enum?.length) return s.enum[0];
  if (s.allOf) return Object.assign({}, ...s.allOf.map((x: any) => sample(doc, x, depth + 1)));
  if (s.oneOf || s.anyOf) return sample(doc, (s.oneOf ?? s.anyOf)[0], depth + 1);
  switch (s.type ?? (s.properties ? "object" : undefined)) {
    case "object":
      return Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, sample(doc, v, depth + 1)]));
    case "array":
      return [sample(doc, s.items, depth + 1)];
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return true;
    case "string":
      return s.format === "date-time" ? "2026-01-01T00:00:00Z" : s.format === "uuid" ? "00000000-0000-4000-8000-000000000000" : s.format === "email" ? "user@example.com" : "string";
    default:
      return null;
  }
}

/** Converts an OpenAPI 3.x document (JSON or YAML) into a collection grouped by first tag. */
export function importOpenApi(input: string | Obj): Collection {
  const doc: Obj = typeof input === "string" ? (input.trim().startsWith("{") ? JSON.parse(input) : parseYaml(input)) : input;
  if (!doc.openapi || !String(doc.openapi).startsWith("3")) throw new Error("Only OpenAPI 3.x documents are supported");
  const server = String(doc.servers?.[0]?.url ?? "http://localhost").replace(/\/$/, "");
  const variable: Variable[] = [{ key: "baseUrl", value: server }];
  const folders = new Map<string, ItemGroup>();
  const root: (Item | ItemGroup)[] = [];
  for (const [path, pathItem] of Object.entries<Obj>(doc.paths ?? {})) {
    for (const m of METHODS) {
      const op = pathItem[m];
      if (!op) continue;
      const params = [...(pathItem.parameters ?? []), ...(op.parameters ?? [])].map((p: any) => deref(doc, p));
      const pathSegs = path.split("/").filter(Boolean).map((s) => s.replace(/^\{(.+)\}$/, ":$1"));
      const query = params.filter((p) => p.in === "query").map((p) => ({ key: p.name, value: String(sample(doc, p.schema) ?? ""), ...(p.required ? {} : { disabled: true }) }));
      const header = params.filter((p) => p.in === "header").map((p) => ({ key: p.name, value: String(sample(doc, p.schema) ?? "") }));
      const pathVars = params.filter((p) => p.in === "path").map((p) => ({ key: p.name, value: "", description: p.description }));
      const qs = query.filter((q) => !q.disabled).map((q) => `${q.key}=${q.value}`).join("&");
      const url = { raw: `{{baseUrl}}/${pathSegs.join("/")}${qs ? `?${qs}` : ""}`, host: ["{{baseUrl}}"], path: pathSegs, ...(query.length ? { query } : {}), ...(pathVars.length ? { variable: pathVars } : {}) };
      let body;
      const rb = deref(doc, op.requestBody);
      const content = rb?.content ?? {};
      if (content["application/json"]) {
        body = { mode: "raw" as const, raw: JSON.stringify(content["application/json"].example ?? sample(doc, content["application/json"].schema), null, 2), options: { raw: { language: "json" } } };
        header.push({ key: "Content-Type", value: "application/json" });
      } else if (content["application/x-www-form-urlencoded"]) {
        const obj = sample(doc, content["application/x-www-form-urlencoded"].schema) as Obj;
        body = { mode: "urlencoded" as const, urlencoded: Object.entries(obj ?? {}).map(([key, v]) => ({ key, value: String(v) })) };
      } else if (content["multipart/form-data"]) {
        const obj = sample(doc, content["multipart/form-data"].schema) as Obj;
        body = { mode: "formdata" as const, formdata: Object.entries(obj ?? {}).map(([key, v]) => ({ key, value: String(v), type: "text" as const })) };
      }
      const request = { method: m.toUpperCase(), header, url, ...(body ? { body } : {}), ...(op.description ? { description: op.description } : {}) };
      const response = Object.entries<Obj>(op.responses ?? {}).map(([code, r0]) => {
        const r = deref(doc, r0);
        const json = r.content?.["application/json"];
        return { name: r.description ?? code, originalRequest: request, code: /^\d+$/.test(code) ? Number(code) : 200, status: r.description ?? "", header: json ? [{ key: "Content-Type", value: "application/json" }] : [], body: json ? JSON.stringify(json.example ?? sample(doc, json.schema), null, 2) : "" };
      });
      const item: Item = { name: op.summary ?? op.operationId ?? `${m.toUpperCase()} ${path}`, request, response };
      const tag = op.tags?.[0];
      if (tag) {
        if (!folders.has(tag)) {
          const f: ItemGroup = { name: tag, item: [] };
          folders.set(tag, f);
          root.push(f);
        }
        folders.get(tag)!.item.push(item);
      } else root.push(item);
    }
  }
  return { info: { name: doc.info?.title ?? "OpenAPI import", description: doc.info?.description, schema: SCHEMA_V21 }, item: root, variable };
}
