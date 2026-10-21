import type { Collection, Item } from "@postbench/core";
import { SCHEMA_V21 } from "@postbench/core";

interface HarEntry {
  request: { method: string; url: string; headers: { name: string; value: string }[]; postData?: { mimeType?: string; text?: string; params?: { name: string; value?: string }[] } };
  response?: { status: number; statusText: string; headers: { name: string; value: string }[]; content?: { text?: string } };
}

const SKIP = /^(:|content-length$|host$|connection$|accept-encoding$)/i;

/** Converts a HAR log to a collection, one request per entry, keeping the response as an example. */
export function importHar(har: { log: { entries: HarEntry[] } } | string, name = "HAR import"): Collection {
  const data = typeof har === "string" ? JSON.parse(har) : har;
  const item: Item[] = data.log.entries.map((e: HarEntry) => {
    const pd = e.request.postData;
    const body = pd
      ? pd.params?.length && /x-www-form-urlencoded/.test(pd.mimeType ?? "")
        ? { mode: "urlencoded" as const, urlencoded: pd.params.map((p) => ({ key: p.name, value: p.value ?? "" })) }
        : { mode: "raw" as const, raw: pd.text ?? "", ...(/json/.test(pd.mimeType ?? "") ? { options: { raw: { language: "json" } } } : {}) }
      : undefined;
    const u = new URL(e.request.url);
    const request = { method: e.request.method, header: e.request.headers.filter((h) => !SKIP.test(h.name)).map((h) => ({ key: h.name, value: h.value })), url: e.request.url, ...(body ? { body } : {}) };
    return {
      name: `${e.request.method} ${u.pathname}`,
      request,
      response: e.response ? [{ name: `${e.response.status} ${e.response.statusText}`, originalRequest: request, code: e.response.status, status: e.response.statusText, header: e.response.headers.map((h) => ({ key: h.name, value: h.value })), body: e.response.content?.text ?? "" }] : [],
    };
  });
  return { info: { name, schema: SCHEMA_V21 }, item };
}
