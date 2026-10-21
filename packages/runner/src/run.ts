import { EventEmitter } from "node:events";
import type { Collection, EnvironmentFile, Event, Header, Item, ItemGroup, RequestObject } from "@postbench/core";
import { VariableResolver, VariableScope, findEntity, isItemGroup, scriptText, walkItems, type WalkEntry } from "@postbench/core";
import { CookieJar, effectiveBehavior, prepareRequest, send, type PreparedRequest, type ProxyConfig, type ResponseData } from "@postbench/engine";
import { runScript, type Assertion, type ScriptRequest, type ScriptResponse, type ScriptResult } from "@postbench/sandbox";

export interface RunOptions {
  environment?: EnvironmentFile;
  globals?: EnvironmentFile;
  iterationCount?: number;
  iterationData?: Record<string, unknown>[];
  /** Run only these folders or requests (by name or id), in the given order. */
  folder?: string[];
  envVar?: Record<string, string>;
  globalVar?: Record<string, string>;
  delayRequest?: number;
  timeoutRequest?: number;
  timeoutScript?: number;
  bail?: boolean;
  insecure?: boolean;
  ignoreRedirects?: boolean;
  disableCookies?: boolean;
  workingDir?: string;
  proxy?: ProxyConfig;
  tls?: { ca?: Buffer; cert?: Buffer; key?: Buffer; passphrase?: string };
  /** Replace the network layer (used by the desktop app and tests). */
  sender?: (req: PreparedRequest, opts: Parameters<typeof send>[1]) => Promise<ResponseData>;
}

export interface ExecutionRecord {
  id: string;
  cursor: { iteration: number; position: number };
  item: { id?: string; name: string; path: string[] };
  request?: PreparedRequest;
  response?: ResponseData;
  requestError?: { message: string };
  assertions: (Assertion & { event: "prerequest" | "test" })[];
  scriptErrors: { event: string; message: string; name: string }[];
  console: { level: string; messages: unknown[] }[];
  skipped?: boolean;
  visualizer?: { template: string; data: unknown };
}

export interface RunStats {
  iterations: { total: number; failed: number };
  items: { total: number; failed: number };
  scripts: { total: number; failed: number };
  prerequests: { total: number; failed: number };
  requests: { total: number; failed: number };
  tests: { total: number; failed: number };
  assertions: { total: number; failed: number };
  testScripts: { total: number; failed: number };
  prerequestScripts: { total: number; failed: number };
}

export interface RunFailure {
  source: string;
  at: string;
  error: { name: string; message: string; test?: string };
  cursor: { iteration: number; position: number };
}

export interface RunSummary {
  collection: { name: string; id?: string };
  stats: RunStats;
  timings: { started: number; completed: number; responseAverage: number; responseMin: number; responseMax: number };
  executions: ExecutionRecord[];
  failures: RunFailure[];
  environment: VariableScope;
  globals: VariableScope;
  collectionVariables: VariableScope;
  error?: { message: string };
}

const zero = () => ({ total: 0, failed: 0 });

/** Selects items for `--folder`, preserving collection order inside each selection. */
function selectEntries(collection: Collection, folders?: string[]): WalkEntry[] {
  const all = [...walkItems(collection)];
  if (!folders?.length) return all;
  const out: WalkEntry[] = [];
  for (const f of folders) {
    const target = findEntity(collection, f);
    if (!target) throw new Error(`Unable to find a folder or request: ${f}`);
    const matches = isItemGroup(target) ? all.filter((e) => e.parents.includes(target)) : all.filter((e) => e.item === target);
    out.push(...matches);
  }
  return out;
}

const eventsOf = (holder: { event?: Event[] } | undefined, listen: string) => (holder?.event ?? []).filter((e) => e.listen === listen && !e.disabled && e.script);

function toScriptRequest(p: PreparedRequest, item: Item): ScriptRequest {
  const body = p.body.kind === "text" || p.body.kind === "urlencoded" ? p.body.text : undefined;
  return { id: item.id, name: item.name, method: p.method, url: p.url, headers: p.headers.map((h) => ({ ...h })), body, auth: p.auth };
}

function toScriptResponse(r: ResponseData): ScriptResponse {
  return { code: r.code, status: r.status, headers: r.headers, body: r.body, responseTime: r.responseTime, responseSize: r.responseSize };
}

export class CollectionRun extends EventEmitter {
  constructor(readonly collection: Collection, readonly options: RunOptions = {}) {
    super();
  }

  async start(): Promise<RunSummary> {
    const { collection, options: o } = this;
    const environment = o.environment ? VariableScope.fromEnvironment(o.environment, "environment") : new VariableScope("environment");
    const globals = o.globals ? VariableScope.fromEnvironment(o.globals, "globals") : new VariableScope("globals");
    for (const [k, v] of Object.entries(o.envVar ?? {})) environment.set(k, v);
    for (const [k, v] of Object.entries(o.globalVar ?? {})) globals.set(k, v);
    const collectionVariables = new VariableScope("collection", collection.variable ?? []);
    const jar = new CookieJar();
    const data = o.iterationData ?? [];
    const iterations = o.iterationCount ?? (data.length || 1);
    const entries = selectEntries(collection, o.folder);
    const stats: RunStats = { iterations: zero(), items: zero(), scripts: zero(), prerequests: zero(), requests: zero(), tests: zero(), assertions: zero(), testScripts: zero(), prerequestScripts: zero() };
    const executions: ExecutionRecord[] = [];
    const failures: RunFailure[] = [];
    const times: number[] = [];
    const started = Date.now();
    const sender = o.sender ?? send;
    let bailed = false;

    this.emit("start", { collection });
    iterationLoop: for (let iteration = 0; iteration < iterations; iteration++) {
      const dataScope = VariableScope.fromObject(data[iteration % Math.max(data.length, 1)] ?? {}, "data");
      stats.iterations.total++;
      let iterationFailed = false;
      this.emit("beforeIteration", { iteration });
      let position = 0;
      let guard = 0;
      while (position < entries.length) {
        if (++guard > 10000) throw new Error("setNextRequest loop exceeded 10000 steps");
        const entry = entries[position]!;
        const { item, parents } = entry;
        const cursor = { iteration, position };
        const local = new VariableScope("local");
        const scopes = { local, data: dataScope, environment, collection: collectionVariables, globals };
        const resolver = new VariableResolver([local, dataScope, environment, collectionVariables, globals]);
        const exec: ExecutionRecord = { id: `${iteration}:${position}`, cursor, item: { id: item.id, name: item.name ?? "", path: entry.path }, assertions: [], scriptErrors: [], console: [] };
        stats.items.total++;
        this.emit("beforeItem", { cursor, item });
        const chain: { event?: Event[] }[] = [collection, ...parents, item];
        const behavior = effectiveBehavior(item, parents, collection);
        let next: string | null | undefined;
        let itemFailed = false;

        const runEvents = async (listen: "prerequest" | "test", request: ScriptRequest, response?: ScriptResponse, cookies?: ResponseData["cookies"]) => {
          const results: ScriptResult[] = [];
          let current = request;
          for (const holder of chain) {
            for (const ev of eventsOf(holder, listen)) {
              const code = scriptText(ev.script!.exec);
              if (!code.trim()) continue;
              stats.scripts.total++;
              const bucket = listen === "test" ? stats.testScripts : stats.prerequestScripts;
              bucket.total++;
              const res = await runScript(code, {
                eventName: listen,
                iteration,
                iterationCount: iterations,
                requestName: item.name,
                requestId: item.id,
                scopes,
                request: current,
                response,
                cookies,
                sendRequest: async (r) => {
                  const req: RequestObject | string = typeof r === "string" ? r : { method: r.method, url: r.url, header: r.headers as Header[], body: typeof r.body === "string" ? { mode: "raw", raw: r.body } : (r.body as RequestObject["body"]) };
                  const prepared = prepareRequest(req, { resolver });
                  const out = await sender(prepared, { cookieJar: jar, timeout: o.timeoutRequest, behavior: { strictSSL: !o.insecure } });
                  return toScriptResponse(out);
                },
              }, { timeout: o.timeoutScript ?? 10000 });
              current = res.request;
              results.push(res);
              exec.console.push(...res.console);
              if (res.visualizer) exec.visualizer = res.visualizer;
              if (res.nextRequest !== undefined) next = res.nextRequest;
              for (const a of res.assertions) {
                exec.assertions.push({ ...a, event: listen });
                stats.assertions.total++;
                if (!a.passed) {
                  stats.assertions.failed++;
                  itemFailed = true;
                  failures.push({ source: item.name ?? "", at: `assertion:${a.index} in ${listen}-script`, error: { name: "AssertionError", message: a.error?.message ?? "assertion failed", test: a.name }, cursor });
                  this.emit("assertion", { cursor, item, assertion: a });
                } else this.emit("assertion", { cursor, item, assertion: a });
              }
              if (res.error) {
                bucket.failed++;
                stats.scripts.failed++;
                itemFailed = true;
                exec.scriptErrors.push({ event: listen, message: res.error.message, name: res.error.name });
                failures.push({ source: item.name ?? "", at: `${listen}-script`, error: { name: res.error.name, message: res.error.message }, cursor });
                this.emit("exception", { cursor, error: res.error });
              }
              this.emit("script", { cursor, item, event: listen, result: res });
            }
          }
          return { results, request: current };
        };

        try {
          let prepared = prepareRequest(item.request, { resolver, parents, collectionAuth: collection.auth, behavior });
          stats.prerequests.total++;
          const pre = await runEvents("prerequest", toScriptRequest(prepared, item));
          const skip = pre.results.some((r) => r.skipRequest);
          if (skip) {
            exec.skipped = true;
          } else {
            // Re-resolve so variables set by pre-request scripts take effect,
            // then apply direct request edits made by the scripts.
            prepared = prepareRequest(item.request, { resolver, parents, collectionAuth: collection.auth, behavior });
            const edited = pre.request;
            const orig = toScriptRequest(prepared, item);
            if (pre.results.length && (edited.url !== orig.url || edited.method !== orig.method || JSON.stringify(edited.headers) !== JSON.stringify(orig.headers))) {
              prepared = { ...prepared, url: resolver.replaceIn(edited.url), method: edited.method, headers: edited.headers.map((h) => ({ key: resolver.replaceIn(h.key), value: resolver.replaceIn(h.value) })) };
            }
            exec.request = prepared;
            stats.requests.total++;
            this.emit("beforeRequest", { cursor, item, request: prepared });
            try {
              const response = await sender(prepared, {
                behavior: { ...behavior, ...(o.ignoreRedirects ? { followRedirects: false } : {}), ...(o.insecure ? { strictSSL: false } : {}), ...(o.disableCookies ? { disableCookies: true } : {}) },
                cookieJar: jar,
                timeout: o.timeoutRequest,
                workingDir: o.workingDir,
                proxy: o.proxy,
                tls: o.tls,
              });
              exec.response = response;
              times.push(response.responseTime);
              this.emit("request", { cursor, item, request: prepared, response });
              stats.tests.total++;
              await runEvents("test", toScriptRequest(prepared, item), toScriptResponse(response), response.cookies);
            } catch (err) {
              stats.requests.failed++;
              itemFailed = true;
              exec.requestError = { message: (err as Error).message };
              failures.push({ source: item.name ?? "", at: "request", error: { name: "Error", message: (err as Error).message }, cursor });
              this.emit("request", { cursor, item, request: prepared, error: err });
              // Test scripts still run without a response, like the runtime.
              stats.tests.total++;
              await runEvents("test", toScriptRequest(prepared, item), undefined);
            }
          }
        } catch (err) {
          itemFailed = true;
          exec.requestError = { message: (err as Error).message };
          failures.push({ source: item.name ?? "", at: "prepare", error: { name: "Error", message: (err as Error).message }, cursor });
        }
        executions.push(exec);
        if (itemFailed) {
          stats.items.failed++;
          iterationFailed = true;
        }
        this.emit("item", { cursor, item, execution: exec });
        if (o.bail && itemFailed) {
          bailed = true;
          break iterationLoop;
        }
        if (next === null) break;
        if (typeof next === "string") {
          const idx = entries.findIndex((e) => e.item.name === next || e.item.id === next);
          if (idx < 0) break;
          position = idx;
        } else position++;
        if (o.delayRequest && position < entries.length) await new Promise((r) => setTimeout(r, o.delayRequest));
      }
      if (iterationFailed) stats.iterations.failed++;
      this.emit("iteration", { iteration });
    }
    const completed = Date.now();
    const summary: RunSummary = {
      collection: { name: collection.info.name, id: collection.info._postman_id },
      stats,
      timings: {
        started,
        completed,
        responseAverage: times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0,
        responseMin: times.length ? Math.min(...times) : 0,
        responseMax: times.length ? Math.max(...times) : 0,
      },
      executions,
      failures,
      environment,
      globals,
      collectionVariables,
      ...(bailed ? { error: { message: "Run bailed after the first failure" } } : {}),
    };
    this.emit("done", summary);
    return summary;
  }
}

export function runCollection(collection: Collection, options: RunOptions = {}): Promise<RunSummary> {
  return new CollectionRun(collection, options).start();
}

export type { ItemGroup };
