// Runs a script through the reference postman-sandbox (Apache-2.0) and
// returns assertions and variable state in the same shape as ours.
import Sandbox from "postman-sandbox";
import sdk from "postman-collection";

export interface OracleInput {
  script: string;
  eventName: "prerequest" | "test";
  env?: Record<string, unknown>;
  globals?: Record<string, unknown>;
  collection?: Record<string, unknown>;
  data?: Record<string, unknown>;
  request: { method: string; url: string; headers?: { key: string; value: string }[]; body?: string };
  response?: { code: number; status: string; headers: { key: string; value: string }[]; body: string; responseTime: number };
}

export interface OracleOutput {
  assertions: { name: string; passed: boolean; skipped: boolean }[];
  env: Record<string, unknown>;
  globals: Record<string, unknown>;
  collection: Record<string, unknown>;
  nextRequest?: string | null;
  error?: string;
}

let ctxPromise: Promise<any> | undefined;
const getCtx = () =>
  (ctxPromise ??= new Promise((resolve, reject) =>
    (Sandbox as any).createContext({ timeout: 10000 }, (err: unknown, ctx: unknown) => (err ? reject(err) : resolve(ctx))),
  ));

const vals = (o: Record<string, unknown> = {}) => ({ values: Object.entries(o).map(([key, value]) => ({ key, value, type: "any" })) });
const toObj = (scope: any) => {
  const out: Record<string, unknown> = {};
  for (const v of scope?.values ?? []) if (v.disabled !== true) out[v.key] = v.value;
  return out;
};

export async function oracle(input: OracleInput): Promise<OracleOutput> {
  const ctx = await getCtx();
  const assertions: OracleOutput["assertions"] = [];
  const onAssert = (_c: unknown, list: any[]) => list.forEach((a) => assertions.push({ name: a.name, passed: a.passed, skipped: a.skipped }));
  ctx.on("execution.assertion", onAssert);
  try {
    const request = new sdk.Request({ method: input.request.method, url: input.request.url, header: input.request.headers ?? [], body: input.request.body ? { mode: "raw", raw: input.request.body } : undefined }).toJSON();
    const response = input.response
      ? new sdk.Response({ code: input.response.code, status: input.response.status, header: input.response.headers, body: input.response.body, responseTime: input.response.responseTime }).toJSON()
      : undefined;
    const result: any = await new Promise((resolve) =>
      ctx.execute(
        { listen: input.eventName, script: { exec: input.script } },
        {
          context: {
            environment: vals(input.env),
            globals: vals(input.globals),
            collectionVariables: vals(input.collection),
            data: input.data ?? {},
            _variables: vals(),
            request,
            response,
          },
        },
        (err: Error | null, res: unknown) => resolve({ err, res }),
      ),
    );
    const res = result.res ?? {};
    return {
      assertions,
      env: toObj(res.environment),
      globals: toObj(res.globals),
      collection: toObj(res.collectionVariables),
      nextRequest: res.return?.nextRequest,
      error: result.err ? String(result.err.message) : undefined,
    };
  } finally {
    ctx.off?.("execution.assertion", onAssert);
    ctx.removeListener?.("execution.assertion", onAssert);
  }
}
