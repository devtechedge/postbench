import type { Collection, EnvironmentFile, Item, ItemGroup } from "./types.js";
import { isItemGroup } from "./types.js";

export const SCHEMA_V21 = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";
export const SCHEMA_V20 = "https://schema.getpostman.com/json/collection/v2.0.0/collection.json";

export type CollectionVersion = "v2.1" | "v2.0" | "v1" | "unknown";

/** Layout facts captured at parse time so serialization can be byte-stable. */
export interface JsonLayout {
  indent: string;
  trailingNewline: boolean;
  bom: boolean;
  crlf: boolean;
}

export interface ParsedCollection {
  collection: Collection;
  version: CollectionVersion;
  layout: JsonLayout;
}

export function detectLayout(text: string): JsonLayout {
  const bom = text.charCodeAt(0) === 0xfeff;
  const body = bom ? text.slice(1) : text;
  const crlf = body.includes("\r\n");
  const m = /^[{[]\r?\n([ \t]+)\S/.exec(body);
  return {
    indent: m ? m[1]! : body.startsWith("{\n") || body.startsWith("[\n") ? "" : "",
    trailingNewline: /\n$/.test(body),
    bom,
    crlf,
  };
}

export function detectVersion(c: unknown): CollectionVersion {
  if (!c || typeof c !== "object") return "unknown";
  const o = c as Record<string, unknown>;
  const info = o.info as Record<string, unknown> | undefined;
  const schema = typeof info?.schema === "string" ? info.schema : "";
  if (schema.includes("/v2.1.")) return "v2.1";
  if (schema.includes("/v2.0.")) return "v2.0";
  if (Array.isArray(o.requests) || Array.isArray(o.folders)) return "v1";
  return "unknown";
}

export class CollectionFormatError extends Error {
  constructor(message: string, readonly details: string[] = []) {
    super(message);
    this.name = "CollectionFormatError";
  }
}

/** Parses Postman collection JSON text. v2.0 and v2.1 share the item model. */
export function parseCollection(text: string): ParsedCollection {
  const layout = detectLayout(text);
  let data: unknown;
  try {
    data = JSON.parse(layout.bom ? text.slice(1) : text);
  } catch (e) {
    throw new CollectionFormatError(`Invalid JSON: ${(e as Error).message}`);
  }
  const version = detectVersion(data);
  if (version === "v1") {
    throw new CollectionFormatError("Collection format v1 is not supported; re-export as v2.1");
  }
  const c = data as Collection;
  if (!c || typeof c !== "object" || !c.info || !Array.isArray(c.item)) {
    throw new CollectionFormatError("Not a Postman collection: expected info and item[]");
  }
  return { collection: c, version, layout };
}

/**
 * Serializes a collection. With the layout from parseCollection the output
 * is byte-identical to the input for documents produced by JSON.stringify
 * (which is how Postman writes exports, using a tab indent).
 */
export function serializeCollection(c: Collection | EnvironmentFile, layout?: Partial<JsonLayout>): string {
  const l: JsonLayout = { indent: "\t", trailingNewline: false, bom: false, crlf: false, ...layout };
  let out = JSON.stringify(c, null, l.indent || undefined);
  if (l.crlf) out = out.replace(/\n/g, "\r\n");
  if (l.trailingNewline) out += l.crlf ? "\r\n" : "\n";
  return (l.bom ? "\ufeff" : "") + out;
}

export interface WalkEntry {
  item: Item;
  /** Folder chain from the collection root to the item's parent. */
  parents: ItemGroup[];
  path: string[];
}

/** Depth-first walk over request items, in run order. */
export function* walkItems(root: { item: (Item | ItemGroup)[] }, parents: ItemGroup[] = []): Generator<WalkEntry> {
  for (const it of root.item) {
    if (isItemGroup(it)) {
      yield* walkItems(it, [...parents, it]);
    } else {
      yield { item: it, parents, path: [...parents.map((p) => p.name ?? ""), it.name ?? ""] };
    }
  }
}

/** Finds a folder or item by name or id anywhere in the tree (first match, depth-first). */
export function findEntity(root: { item: (Item | ItemGroup)[] }, nameOrId: string): Item | ItemGroup | undefined {
  for (const it of root.item) {
    if (it.name === nameOrId || (it as Item).id === nameOrId) return it;
    if (isItemGroup(it)) {
      const f = findEntity(it, nameOrId);
      if (f) return f;
    }
  }
  return undefined;
}

export function parseEnvironment(text: string): EnvironmentFile {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const parsed = JSON.parse(body) as EnvironmentFile | EnvironmentFile["values"];
  // A bare array of variables is accepted too (older globals exports).
  const data = Array.isArray(parsed) ? { values: parsed } : parsed;
  if (!data || !Array.isArray(data.values)) {
    throw new CollectionFormatError("Not a Postman environment or globals file: expected values[]");
  }
  return data;
}

export function scriptText(exec: string | string[] | undefined): string {
  if (exec === undefined) return "";
  return Array.isArray(exec) ? exec.join("\n") : exec;
}
