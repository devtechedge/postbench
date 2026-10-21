import type { RunSummary } from "../run.js";

const text = (b?: Uint8Array) => (b ? Buffer.from(b).toString("utf8") : undefined);

/** newman-style JSON report: { collection, environment, globals, run }. */
export function jsonReport(s: RunSummary, collection: unknown): unknown {
  return {
    collection,
    environment: { values: s.environment.toEnvironment().values },
    globals: { values: s.globals.toEnvironment().values },
    run: {
      stats: s.stats,
      timings: s.timings,
      executions: s.executions.map((e) => ({
        cursor: e.cursor,
        item: e.item,
        request: e.request && { method: e.request.method, url: e.request.url, header: e.request.headers },
        response: e.response && {
          code: e.response.code,
          status: e.response.status,
          header: e.response.headers,
          responseTime: e.response.responseTime,
          responseSize: e.response.responseSize,
          timings: e.response.timings,
          body: text(e.response.body),
        },
        requestError: e.requestError,
        assertions: e.assertions.map((a) => ({ assertion: a.name, skipped: a.skipped, ...(a.passed ? {} : { error: a.error }) })),
        scriptErrors: e.scriptErrors,
      })),
      failures: s.failures,
      error: s.error ?? null,
    },
  };
}
