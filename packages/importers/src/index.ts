export { importCurl, tokenize } from "./curl.js";
export { importHar } from "./har.js";
export { importOpenApi, sample } from "./openapi.js";
import { parseCollection, SCHEMA_V21, type Collection } from "@postbench/core";
import { importCurl } from "./curl.js";
import { importHar } from "./har.js";
import { importOpenApi } from "./openapi.js";

export type ImportKind = "postman" | "openapi" | "curl" | "har";

/** Detects the input type and converts it to a collection. */
export function importAny(text: string): { kind: ImportKind; collection: Collection } {
  const t = text.trim();
  if (t.startsWith("curl ")) return { kind: "curl", collection: { info: { name: "curl import", schema: SCHEMA_V21 }, item: [importCurl(t)] } };
  if (/^(openapi:|["']?openapi["']?\s*:)/m.test(t) || /"openapi"\s*:/.test(t.slice(0, 500))) return { kind: "openapi", collection: importOpenApi(t) };
  const data = JSON.parse(t);
  if (data.log?.entries) return { kind: "har", collection: importHar(data) };
  return { kind: "postman", collection: parseCollection(t).collection };
}
