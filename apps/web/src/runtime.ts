// Browser runtime: prepare, run pre-request scripts, send, run tests.
import type { Collection, Event, Item, ItemGroup } from "@postbench/core";
import { VariableResolver, VariableScope, scriptText, walkItems } from "@postbench/core";
import { effectiveBehavior, prepareRequest, type PreparedRequest } from "@postbench/engine/prepare";
import { buildGlobals, type Assertion, type ScriptContext, type ScriptResult } from "@postbench/sandbox/pm";
import { sendRequest, type WireResponse } from "./transport";

export interface Scopes {
  environment: VariableScope;
  globals: VariableScope;
  collection: VariableScope;
}

export interface ExecResult {
  request: PreparedRequest;
  response?: WireResponse;
  error?: string;
  assertions: Assertion[];
  scriptErrors: string[];
  console: string[];
}

/** Runs one script in the page. Browsers have no node:vm, so scripts share the page realm. */
async function runInPage(code: string, ctx: ScriptContext): Promise<ScriptResult> {
  const { globals, result, tracker, finalize } = buildGlobals(ctx);
  const names = Object.keys(globals);
  try {
    const fn = new Function(...names, `return (async () => {\n${code}\n})();`);
    tracker.add();
    await (fn(...names.map((n) => globals[n])) as Promise<unknown>).then(
      () => tracker.done(),
      (e: Error) => {
        result.error = { name: e?.name ?? "Error", message: e?.message ?? String(e) };
        tracker.done();
      },
    );
  } catch (e) {
    result.error = { name: (e as Error).name, message: (e as Error).message };
  }
  await Promise.race([tracker.idle(), new Promise((r) => setTimeout(r, 10000))]);
  return finalize();
}

function chainOf(c: Collection, item: Item): { parents: ItemGroup[] } {
  for (const e of walkItems(c)) if (e.item === item) return { parents: e.parents };
  return { parents: [] };
}

const events = (h: { event?: Event[] } | undefined, l: string) => (h?.event ?? []).filter((e) => e.listen === l && !e.disabled && e.script);

export async function executeItem(c: Collection, item: Item, scopes: Scopes, data: Record<string, unknown> = {}): Promise<ExecResult> {
  const { parents } = chainOf(c, item);
  const local = new VariableScope("local");
  const dataScope = VariableScope.fromObject(data, "data");
  const resolver = new VariableResolver([local, dataScope, scopes.environment, scopes.collection, scopes.globals]);
  const behavior = effectiveBehavior(item, parents, c);
  const sc = { local, data: dataScope, environment: scopes.environment, collection: scopes.collection, globals: scopes.globals };
  const out: ExecResult = { request: prepareRequest(item.request, { resolver, parents, collectionAuth: c.auth, behavior }), assertions: [], scriptErrors: [], console: [] };
  const chain = [c, ...parents, item];
  const run = async (listen: "prerequest" | "test", response?: WireResponse) => {
    for (const h of chain) for (const ev of events(h, listen)) {
      const r = await runInPage(scriptText(ev.script!.exec), {
        eventName: listen,
        requestName: item.name,
        requestId: item.id,
        scopes: sc,
        request: { method: out.request.method, url: out.request.url, headers: out.request.headers, name: item.name },
        response,
        sendRequest: async (q) => {
          const p = prepareRequest(typeof q === "string" ? q : { method: q.method, url: q.url, header: q.headers as never }, { resolver });
          return sendRequest(p);
        },
      });
      out.assertions.push(...r.assertions);
      if (r.error) out.scriptErrors.push(`${listen}: ${r.error.name}: ${r.error.message}`);
      out.console.push(...r.console.map((l) => l.messages.map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join(" ")));
      if (listen === "prerequest") {
        out.request = prepareRequest(item.request, { resolver, parents, collectionAuth: c.auth, behavior });
        if (r.request.headers.length !== out.request.headers.length) out.request.headers = r.request.headers.map((h) => ({ key: h.key, value: resolver.replaceIn(h.value) }));
      }
    }
  };
  await run("prerequest");
  try {
    out.response = await sendRequest(out.request);
  } catch (e) {
    out.error = (e as Error).message || "Network error (the server may not allow CORS from this page)";
  }
  await run("test", out.response);
  return out;
}

export async function runAll(c: Collection, scopes: Scopes, onItem: (name: string, r: ExecResult) => void): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;
  for (const { item } of walkItems(c)) {
    const r = await executeItem(c, item, scopes);
    for (const a of r.assertions) a.passed ? passed++ : failed++;
    onItem(item.name ?? "", r);
  }
  return { passed, failed };
}
