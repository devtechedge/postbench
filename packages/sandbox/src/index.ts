import vm from "node:vm";
import { buildGlobals } from "./pm.js";
import type { ScriptContext, ScriptResult } from "./types.js";

export * from "./types.js";
export { buildGlobals, makeResponse, makeRequest, PendingTracker } from "./pm.js";
export { KVList, ScriptUrl } from "./lists.js";

/** Legacy sandbox helpers that old collections rely on. */
const LEGACY_PRELUDE = `Object.defineProperty(String.prototype, "has", { value: function (s) { return this.indexOf(s) > -1; }, writable: true, configurable: true });`;

export interface RunScriptOptions {
  /** Max time to wait for async work (timers, sendRequest, async tests). */
  timeout?: number;
  filename?: string;
}

/**
 * Runs a Postman script in a fresh node:vm context. Errors are captured on
 * the result; assertions recorded before an error are kept.
 */
export async function runScript(code: string, ctx: ScriptContext, opts: RunScriptOptions = {}): Promise<ScriptResult> {
  const { globals, result, tracker, finalize } = buildGlobals(ctx);
  const context = vm.createContext({ ...globals, Buffer, TextEncoder, TextDecoder, URL, URLSearchParams, structuredClone });
  vm.runInContext(LEGACY_PRELUDE, context);
  const timeout = opts.timeout ?? 10000;
  const capture = (err: unknown) => {
    if (result.error) return;
    const e = err as Error;
    result.error = { name: e?.name ?? "Error", message: e?.message ?? String(err), stack: e?.stack };
  };
  try {
    // Wrap in an async function so top-level await works like newer
    // Postman runtimes; a sync throw still surfaces as a rejection.
    const script = new vm.Script(`(async () => {\n${code}\n})()`, { filename: opts.filename ?? "script.js", lineOffset: -1 });
    const p = script.runInContext(context, { timeout }) as Promise<unknown>;
    tracker.add();
    await p.then(() => tracker.done(), (e) => { capture(e); tracker.done(); });
  } catch (err) {
    capture(err);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    tracker.idle(),
    new Promise<void>((r) => {
      timer = setTimeout(() => {
        if (tracker.pending) capture(new Error(`Script timed out after ${timeout}ms with pending work`));
        tracker.cancelAll();
        r();
      }, timeout);
    }),
  ]);
  clearTimeout(timer);
  return finalize();
}
