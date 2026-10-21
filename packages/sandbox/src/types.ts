import type { VariableScope } from "@postbench/core";

export interface KV {
  key: string;
  value: string;
  disabled?: boolean;
}

export interface ScriptRequest {
  id?: string;
  name?: string;
  method: string;
  url: string;
  headers: KV[];
  body?: unknown;
  auth?: unknown;
}

export interface ScriptResponse {
  code: number;
  status: string;
  headers: KV[];
  body: Uint8Array | string;
  responseTime: number;
  responseSize?: number;
}

export interface ScriptCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  [k: string]: unknown;
}

export interface Assertion {
  index: number;
  name: string;
  passed: boolean;
  skipped: boolean;
  async: boolean;
  error?: { name: string; message: string };
}

export interface ConsoleEntry {
  level: "log" | "info" | "warn" | "error" | "debug";
  messages: unknown[];
}

/** Host hook used by pm.sendRequest. */
export type SendRequestHook = (request: ScriptRequest | string) => Promise<ScriptResponse>;

export interface ScriptContext {
  eventName: "prerequest" | "test" | string;
  iteration?: number;
  iterationCount?: number;
  requestName?: string;
  requestDescription?: string;
  requestId?: string;
  scopes: {
    local: VariableScope;
    data: VariableScope;
    environment: VariableScope;
    collection: VariableScope;
    globals: VariableScope;
  };
  request: ScriptRequest;
  response?: ScriptResponse;
  cookies?: ScriptCookie[];
  sendRequest?: SendRequestHook;
}

export interface ScriptResult {
  assertions: Assertion[];
  error?: { name: string; message: string; stack?: string };
  /** undefined when not set; null means stop the run. */
  nextRequest?: string | null;
  skipRequest: boolean;
  console: ConsoleEntry[];
  visualizer?: { template: string; data: unknown };
  /** The (possibly modified) request after a pre-request script. */
  request: ScriptRequest;
}
