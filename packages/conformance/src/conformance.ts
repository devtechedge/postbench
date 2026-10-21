// Runs every collection through newman (the reference runner) and through
// postbench against the same local echo server, then compares results.
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import newman from "newman";
import { parseCollection, parseEnvironment, type Collection } from "@postbench/core";
import { startEchoServer } from "@postbench/echo";
import { parseDataFile, runCollection } from "@postbench/runner";

export interface Step {
  item: string;
  code?: number;
  assertions: [string, boolean][];
}

export interface CaseResult {
  name: string;
  status: "match" | "mismatch" | "unsupported" | "error";
  reason?: string;
  newman: { requests: number; assertions: number; failed: number };
  postbench: { requests: number; assertions: number; failed: number };
  matchedAssertions: number;
  diff?: string[];
}

const ECHO_HOSTS = [/https?:\/\/postman-echo\.com/g];

/** Points every postman-echo.com reference at the local echo server. */
function rewrite(text: string, echoUrl: string): string {
  const hostPort = echoUrl.replace(/^https?:\/\//, "");
  const port = hostPort.split(":")[1]!;
  let out = ECHO_HOSTS.reduce((t, re) => t.replace(re, echoUrl), text).replace(/postman-echo\.com/g, hostPort);
  try {
    const data = JSON.parse(out);
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== "object") return;
      const r = o as Record<string, unknown>;
      if (Array.isArray(r.host) && r.host.join(".") === "postman-echo.com") {
        r.host = ["127", "0", "0", "1"];
        r.port = port;
        if (r.protocol === "https") r.protocol = "http";
      }
      Object.values(r).forEach(walk);
    };
    walk(data);
    out = JSON.stringify(data);
  } catch {
    // Not JSON (CSV data files): the textual replacement is enough.
  }
  return out;
}

function decodeText(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  return buf.toString("utf8");
}

export function discover(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const p = join(root, entry);
    if (statSync(p).isDirectory()) out.push(...discover(p));
    else if (entry.endsWith(".postman_collection.json")) out.push(p);
  }
  return out.sort();
}

function companion(file: string, suffixes: string[]): string | undefined {
  const dir = dirname(file);
  const base = basename(file).replace(".postman_collection.json", "");
  for (const s of suffixes) {
    const exact = join(dir, `${base}${s}`);
    if (existsSync(exact)) return exact;
  }
  // Single companion in a fixture directory.
  if (dir !== dirname(dir)) {
    for (const s of suffixes) {
      const all = readdirSync(dir).filter((f) => f.endsWith(s));
      if (all.length === 1) return join(dir, all[0]!);
    }
  }
  return undefined;
}

const steps = {
  newman(summary: any): Step[] {
    return summary.run.executions.map((e: any) => ({
      item: e.item.name,
      code: e.response?.code,
      assertions: (e.assertions ?? []).map((a: any) => [a.assertion, !a.error] as [string, boolean]),
    }));
  },
};

function newmanRun(options: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    newman.run({ reporters: [], ...options } as any, (err: Error | null, summary: any) => (err ? reject(err) : resolve(summary)));
  });
}

export async function runCase(file: string, root: string, echoUrl: string, workDir: string): Promise<CaseResult> {
  const name = relative(root, file);
  const empty = { requests: 0, assertions: 0, failed: 0 };
  const raw = rewrite(decodeText(readFileSync(file)).replace(/^\ufeff/, ""), echoUrl);
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { name, status: "error", reason: `invalid JSON: ${(e as Error).message}`, newman: empty, postbench: empty, matchedAssertions: 0 };
  }
  const envFile = companion(file, [".postman_environment.json"]);
  const globFile = companion(file, [".postman_globals.json"]);
  const dataFile = companion(file, [".postman_data.json", ".postman_data.csv", ".csv"]);
  const env = envFile ? JSON.parse(rewrite(decodeText(readFileSync(envFile)).replace(/^\ufeff/, ""), echoUrl)) : undefined;
  const glob = globFile ? JSON.parse(rewrite(decodeText(readFileSync(globFile)).replace(/^\ufeff/, ""), echoUrl)) : undefined;
  const dataText = dataFile ? rewrite(decodeText(readFileSync(dataFile)), echoUrl) : undefined;
  const dataPath = dataFile ? join(workDir, basename(dataFile)) : undefined;
  if (dataPath && dataText !== undefined) writeFileSync(dataPath, dataText);
  const working = dirname(file);

  let ref: any;
  try {
    ref = await newmanRun({ collection: data, environment: env, globals: glob, iterationData: dataPath, workingDir: working, timeoutRequest: 5000 });
  } catch (e) {
    return { name, status: "error", reason: `newman: ${(e as Error).message}`, newman: empty, postbench: empty, matchedAssertions: 0 };
  }
  const refSteps = steps.newman(ref);
  const nStats = { requests: ref.run.stats.requests.total, assertions: ref.run.stats.assertions.total, failed: ref.run.stats.assertions.failed };

  let collection: Collection;
  try {
    collection = parseCollection(JSON.stringify(data)).collection;
  } catch (e) {
    return { name, status: "unsupported", reason: (e as Error).message, newman: nStats, postbench: empty, matchedAssertions: 0 };
  }
  const ours = await runCollection(collection, {
    environment: env ? parseEnvironment(JSON.stringify(env)) : undefined,
    globals: glob ? parseEnvironment(JSON.stringify(glob)) : undefined,
    iterationData: dataText !== undefined ? parseDataFile(dataText, dataFile) : undefined,
    workingDir: working,
    timeoutRequest: 5000,
  });
  const ourSteps: Step[] = ours.executions.map((e) => ({ item: e.item.name, code: e.response?.code, assertions: e.assertions.map((a) => [a.name, a.passed] as [string, boolean]) }));
  const pStats = { requests: ours.stats.requests.total, assertions: ours.stats.assertions.total, failed: ours.stats.assertions.failed };

  const diff: string[] = [];
  let matched = 0;
  const n = Math.max(refSteps.length, ourSteps.length);
  for (let i = 0; i < n; i++) {
    const a = refSteps[i];
    const b = ourSteps[i];
    if (!a || !b) {
      diff.push(`step ${i}: ${a ? `newman ran "${a.item}"` : `postbench ran "${b!.item}"`} only`);
      continue;
    }
    if (a.item !== b.item) diff.push(`step ${i}: item "${a.item}" vs "${b.item}"`);
    if (a.code !== b.code) diff.push(`step ${i} "${a.item}": status ${a.code} vs ${b.code}`);
    const m = Math.max(a.assertions.length, b.assertions.length);
    for (let j = 0; j < m; j++) {
      const x = a.assertions[j];
      const y = b.assertions[j];
      if (x && y && x[0] === y[0] && x[1] === y[1]) matched++;
      else if (x || y) diff.push(`step ${i} "${a.item}" assertion ${j}: ${JSON.stringify(x ?? null)} vs ${JSON.stringify(y ?? null)}`);
    }
  }
  return { name, status: diff.length ? "mismatch" : "match", newman: nStats, postbench: pStats, matchedAssertions: matched, ...(diff.length ? { diff } : {}) };
}

export interface Report {
  generatedAt: string;
  newmanVersion: string;
  cases: CaseResult[];
  totals: { cases: number; match: number; mismatch: number; unsupported: number; error: number; newmanAssertions: number; matchedAssertions: number };
}

export async function runAll(root: string): Promise<Report> {
  const echo = await startEchoServer();
  const work = mkdtempSync(join(tmpdir(), "pb-conf-"));
  cpSync(root, join(work, "src"), { recursive: true });
  const cases: CaseResult[] = [];
  try {
    for (const f of discover(root)) cases.push(await runCase(f, root, echo.url, work));
  } finally {
    await echo.close();
  }
  const count = (s: CaseResult["status"]) => cases.filter((c) => c.status === s).length;
  const newmanVersion = JSON.parse(readFileSync(new URL("../node_modules/newman/package.json", import.meta.url), "utf8")).version;
  return {
    generatedAt: new Date().toISOString(),
    newmanVersion,
    cases,
    totals: {
      cases: cases.length,
      match: count("match"),
      mismatch: count("mismatch"),
      unsupported: count("unsupported"),
      error: count("error"),
      newmanAssertions: cases.reduce((n, c) => n + c.newman.assertions, 0),
      matchedAssertions: cases.reduce((n, c) => n + c.matchedAssertions, 0),
    },
  };
}

export function markdown(r: Report): string {
  const t = r.totals;
  const pct = t.newmanAssertions ? ((100 * t.matchedAssertions) / t.newmanAssertions).toFixed(1) : "0";
  const lines = [
    `# Conformance report`,
    ``,
    `Reference: newman ${r.newmanVersion}. Generated ${r.generatedAt}.`,
    ``,
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Collections | ${t.cases} |`,
    `| Identical results | ${t.match} |`,
    `| Differences | ${t.mismatch} |`,
    `| Unsupported (v1 format) | ${t.unsupported} |`,
    `| Errors | ${t.error} |`,
    `| Assertions matched | ${t.matchedAssertions} / ${t.newmanAssertions} (${pct}%) |`,
    ``,
    `| Collection | Result | newman assertions (failed) | postbench assertions (failed) |`,
    `| --- | --- | --- | --- |`,
    ...r.cases.map((c) => `| ${c.name} | ${c.status}${c.reason ? `: ${c.reason.slice(0, 60)}` : ""} | ${c.newman.assertions} (${c.newman.failed}) | ${c.postbench.assertions} (${c.postbench.failed}) |`),
  ];
  const diffs = r.cases.filter((c) => c.diff);
  if (diffs.length) {
    lines.push("", "## Differences", "");
    for (const c of diffs) {
      lines.push(`### ${c.name}`, "", ...c.diff!.slice(0, 10).map((d) => `- ${d.replace(/\|/g, "\\|")}`), "");
    }
  }
  return lines.join("\n") + "\n";
}
