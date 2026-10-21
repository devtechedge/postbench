// Builds the pm.* API and legacy globals for one script execution. Pure
// JavaScript so it can run under node:vm or in a browser worker.
import { VariableResolver, type VariableScope } from "@postbench/core";
import chai from "chai";
import CryptoJS from "crypto-js";
import _ from "lodash";
import { installResponseAssertions } from "./chai-response.js";
import { KVList, ScriptUrl } from "./lists.js";
import type { Assertion, ConsoleEntry, ScriptContext, ScriptRequest, ScriptResponse, ScriptResult } from "./types.js";

/** Tracks timers and promises a script leaves running. */
export class PendingTracker {
  private count = 0;
  private waiters: (() => void)[] = [];
  private timers = new Set<ReturnType<typeof setTimeout>>();
  add(): void {
    this.count++;
  }
  done(): void {
    this.count = Math.max(0, this.count - 1);
    if (this.count === 0) this.waiters.splice(0).forEach((w) => w());
  }
  get pending(): number {
    return this.count;
  }
  idle(): Promise<void> {
    return this.count === 0 ? Promise.resolve() : new Promise((r) => this.waiters.push(r));
  }
  setTimeout(fn: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) {
    this.add();
    const t = setTimeout(() => {
      this.timers.delete(t);
      try {
        fn(...args);
      } finally {
        this.done();
      }
    }, ms);
    this.timers.add(t);
    return t;
  }
  clearTimeout(t: ReturnType<typeof setTimeout>) {
    if (this.timers.delete(t)) {
      clearTimeout(t);
      this.done();
    }
  }
  cancelAll() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.count = 0;
    this.waiters.splice(0).forEach((w) => w());
  }
}

const textOf = (b: Uint8Array | string) => (typeof b === "string" ? b : new TextDecoder().decode(b));

function scopeApi(scope: VariableScope, resolver: () => VariableResolver, name: string) {
  return {
    name,
    get: (k: string) => scope.get(k),
    set: (k: string, v: unknown, type?: string) => scope.set(k, v, type as never),
    unset: (k: string) => scope.unset(k),
    has: (k: string) => scope.has(k),
    clear: () => scope.clear(),
    toObject: () => scope.toObject(),
    toJSON: () => scope.toJSON(),
    replaceIn: (t: string) => resolver().replaceIn(t),
    values: { each: (fn: (v: unknown) => void) => scope.values.forEach(fn), all: () => scope.toJSON() },
  };
}

export function makeResponse(res: ScriptResponse) {
  const headers = new KVList(res.headers.map((h) => ({ ...h })));
  let cachedText: string | undefined;
  const text = () => (cachedText ??= textOf(res.body));
  return {
    __pbResponse: true as const,
    code: res.code,
    status: res.status,
    headers,
    responseTime: res.responseTime,
    responseSize: res.responseSize ?? (typeof res.body === "string" ? res.body.length : res.body.byteLength),
    text,
    json: () => JSON.parse(text()),
    reason: () => res.status,
    stream: typeof res.body === "string" ? new TextEncoder().encode(res.body) : res.body,
    size: () => ({ body: typeof res.body === "string" ? res.body.length : res.body.byteLength, header: headers.toString().length, total: 0 }),
    get to() {
      return chai.expect(this).to;
    },
    toJSON() {
      return { code: res.code, status: res.status, header: headers.all(), body: text(), responseTime: res.responseTime };
    },
  };
}

export function makeRequest(req: ScriptRequest) {
  const headerItems = req.headers.map((h) => ({ ...h }));
  const headers = new KVList(headerItems);
  let url = new ScriptUrl(req.url);
  const obj = {
    id: req.id,
    name: req.name,
    method: req.method,
    headers,
    body: req.body,
    auth: req.auth,
    get url() {
      return url;
    },
    set url(v: unknown) {
      url = new ScriptUrl(String(v));
    },
    addHeader: (h: { key: string; value: string }) => headers.add(h),
    removeHeader: (k: string) => headers.remove(k),
    upsertHeader: (h: { key: string; value: string }) => headers.upsert(h),
    getHeaders: () => headers.toObject(),
    toJSON() {
      return { method: obj.method, url: url.toString(), header: headers.all(), body: obj.body };
    },
  };
  const snapshot = (): ScriptRequest => ({ ...req, method: String(obj.method).toUpperCase(), url: url.toString(), headers: headerItems.filter((h) => !h.disabled), body: obj.body, auth: obj.auth });
  return { obj, snapshot };
}

export interface BuiltGlobals {
  globals: Record<string, unknown>;
  result: ScriptResult;
  tracker: PendingTracker;
  finalize(): ScriptResult;
}

/** Creates everything a script can see. */
export function buildGlobals(ctx: ScriptContext): BuiltGlobals {
  installResponseAssertions(chai);
  const s = ctx.scopes;
  const resolver = () => new VariableResolver([s.local, s.data, s.environment, s.collection, s.globals]);
  const tracker = new PendingTracker();
  const assertions: Assertion[] = [];
  const consoleEntries: ConsoleEntry[] = [];
  const req = makeRequest(ctx.request);
  const response = ctx.response ? makeResponse(ctx.response) : undefined;
  const result: ScriptResult = { assertions, skipRequest: false, console: consoleEntries, request: ctx.request };

  const record = (name: string, error: unknown, opts: { async?: boolean; skipped?: boolean } = {}) => {
    const e = error as { name?: string; message?: string } | undefined;
    assertions.push({
      index: assertions.length,
      name: String(name),
      passed: !error && !opts.skipped ? true : opts.skipped ? true : false,
      skipped: !!opts.skipped,
      async: !!opts.async,
      ...(error ? { error: { name: e?.name ?? "Error", message: e?.message ?? String(error) } } : {}),
    });
  };

  const test = (name: string, fn?: (done?: (err?: unknown) => void) => unknown) => {
    if (typeof fn !== "function") {
      record(name, undefined, { skipped: true });
      return test;
    }
    if (fn.length > 0) {
      // Async tests are recorded when they settle, so the reported order is
      // completion order (matches postman-sandbox).
      tracker.add();
      let finished = false;
      const done = (err?: unknown) => {
        if (finished) return;
        finished = true;
        record(name, err, { async: true });
        tracker.done();
      };
      try {
        fn(done);
      } catch (err) {
        done(err);
      }
      return test;
    }
    try {
      const out = fn();
      if (out && typeof (out as Promise<unknown>).then === "function") {
        tracker.add();
        (out as Promise<unknown>).then(
          () => {
            record(name, undefined, { async: true });
            tracker.done();
          },
          (err: unknown) => {
            record(name, err ?? new Error("rejected"), { async: true });
            tracker.done();
          },
        );
        return test;
      }
      record(name, undefined);
    } catch (err) {
      record(name, err);
    }
    return test;
  };
  test.skip = (name: string) => {
    record(name, undefined, { skipped: true });
    return test;
  };
  test.index = () => assertions.length;

  const sendRequest = (r: ScriptRequest | string | Record<string, unknown>, cb?: (err: unknown, res?: unknown) => void) => {
    if (!ctx.sendRequest) {
      const err = new Error("pm.sendRequest is not available in this host");
      if (cb) cb(err);
      return Promise.reject(err);
    }
    tracker.add();
    const normalized = typeof r === "string" ? r : normalizeSendRequest(r as Record<string, unknown>);
    const p = ctx.sendRequest(normalized).then(
      (res) => {
        const wrapped = makeResponse(res);
        try {
          cb?.(null, wrapped);
        } finally {
          tracker.done();
        }
        return wrapped;
      },
      (err) => {
        try {
          cb?.(err);
        } finally {
          tracker.done();
        }
        throw err;
      },
    );
    if (cb) p.catch(() => undefined);
    return p;
  };

  const setNextRequest = (name: string | null) => {
    result.nextRequest = name === null ? null : String(name);
  };

  const cookieList = new KVList((ctx.cookies ?? []).map((c) => ({ key: c.name, value: c.value })), false);
  const pm = {
    info: {
      eventName: ctx.eventName,
      iteration: ctx.iteration ?? 0,
      iterationCount: ctx.iterationCount ?? 1,
      requestName: ctx.requestName ?? ctx.request.name ?? "",
      requestId: ctx.requestId ?? ctx.request.id ?? "",
    },
    environment: scopeApi(s.environment, resolver, "environment"),
    globals: scopeApi(s.globals, resolver, "globals"),
    collectionVariables: scopeApi(s.collection, resolver, "collectionVariables"),
    variables: {
      get: (k: string) => resolver().get(k),
      set: (k: string, v: unknown) => s.local.set(k, v),
      has: (k: string) => resolver().has(k),
      unset: (k: string) => s.local.unset(k),
      toObject: () => resolver().toObject(),
      replaceIn: (t: string) => resolver().replaceIn(t),
    },
    iterationData: {
      get: (k: string) => s.data.get(k),
      has: (k: string) => s.data.has(k),
      unset: (k: string) => s.data.unset(k),
      toObject: () => s.data.toObject(),
      toJSON: () => s.data.toObject(),
    },
    request: req.obj,
    response,
    cookies: Object.assign(cookieList, { jar: () => ({ get: (_u: string, n: string, cb: (e: unknown, v?: string) => void) => cb(null, cookieList.get(n)) }) }),
    test,
    expect: chai.expect,
    sendRequest,
    execution: {
      setNextRequest,
      skipRequest: () => {
        result.skipRequest = true;
      },
      location: Object.assign([ctx.requestName ?? ""], { current: ctx.requestName ?? "" }),
    },
    visualizer: {
      set: (template: string, data: unknown) => {
        result.visualizer = { template, data };
      },
      clear: () => {
        result.visualizer = undefined;
      },
    },
    require: (name: string) => requireModule(name),
  };

  const mkConsole = (level: ConsoleEntry["level"]) => (...messages: unknown[]) => consoleEntries.push({ level, messages });
  const sandboxConsole = { log: mkConsole("log"), info: mkConsole("info"), warn: mkConsole("warn"), error: mkConsole("error"), debug: mkConsole("debug") };

  // Legacy (pre pm.*) globals.
  const tests: Record<string, unknown> = {};
  const resText = response ? response.text() : undefined;
  const legacy: Record<string, unknown> = {
    tests,
    environment: s.environment.toObject(),
    globals: s.globals.toObject(),
    data: s.data.toObject(),
    iteration: ctx.iteration ?? 0,
    request: { url: ctx.request.url, method: ctx.request.method, headers: req.obj.headers.toObject(), data: ctx.request.body, name: ctx.requestName ?? "", id: ctx.requestId },
    postman: {
      setEnvironmentVariable: (k: string, v: unknown) => s.environment.set(k, v),
      getEnvironmentVariable: (k: string) => s.environment.get(k),
      clearEnvironmentVariable: (k: string) => s.environment.unset(k),
      clearEnvironmentVariables: () => s.environment.clear(),
      setGlobalVariable: (k: string, v: unknown) => s.globals.set(k, v),
      getGlobalVariable: (k: string) => s.globals.get(k),
      clearGlobalVariable: (k: string) => s.globals.unset(k),
      clearGlobalVariables: () => s.globals.clear(),
      setNextRequest,
      getResponseHeader: (k: string) => response?.headers.get(k),
      getResponseCookie: (n: string) => (cookieList.has(n) ? { name: n, value: cookieList.get(n) } : undefined),
    },
  };
  if (response) {
    Object.assign(legacy, {
      responseBody: resText,
      responseCode: { code: response.code, name: response.status, detail: response.status },
      responseHeaders: response.headers.toObject(),
      responseTime: response.responseTime,
      responseCookies: (ctx.cookies ?? []).map((c) => ({ ...c })),
    });
  }

  const globals: Record<string, unknown> = {
    pm,
    console: sandboxConsole,
    require: requireModule,
    setTimeout: tracker.setTimeout.bind(tracker),
    clearTimeout: tracker.clearTimeout.bind(tracker),
    setImmediate: (fn: () => void) => tracker.setTimeout(fn, 0),
    atob: (s: string) => globalThis.atob(s),
    btoa: (s: string) => globalThis.btoa(s),
    CryptoJS,
    _,
    ...legacy,
  };

  const finalize = (): ScriptResult => {
    for (const [name, v] of Object.entries(tests)) {
      assertions.push({ index: assertions.length, name, passed: !!v, skipped: false, async: false, ...(v ? {} : { error: { name: "AssertionError", message: `expected ${JSON.stringify(name)} to be truthy` } }) });
    }
    result.request = req.snapshot();
    return result;
  };
  return { globals, result, tracker, finalize };
}

function normalizeSendRequest(r: Record<string, unknown>): ScriptRequest {
  const headerIn = r.header ?? r.headers;
  let headers: { key: string; value: string }[] = [];
  if (Array.isArray(headerIn)) headers = headerIn as { key: string; value: string }[];
  else if (headerIn && typeof headerIn === "object") headers = Object.entries(headerIn).map(([key, value]) => ({ key, value: String(value) }));
  else if (typeof headerIn === "string") headers = headerIn.split("\n").filter(Boolean).map((l) => ({ key: l.split(":")[0]!.trim(), value: l.split(":").slice(1).join(":").trim() }));
  const url = typeof r.url === "string" ? r.url : String((r.url as { raw?: string })?.raw ?? r.url ?? "");
  return { method: String(r.method ?? "GET").toUpperCase(), url, headers, body: r.body };
}

const MODULES: Record<string, unknown> = { chai, lodash: _, "crypto-js": CryptoJS };
export function requireModule(name: string): unknown {
  if (name in MODULES) return MODULES[name];
  if (name === "uuid") return { v4: () => (globalThis.crypto as Crypto).randomUUID() };
  if (name === "atob") return (s: string) => globalThis.atob(s);
  if (name === "btoa") return (s: string) => globalThis.btoa(s);
  throw new Error(`Cannot find module '${name}'`);
}
