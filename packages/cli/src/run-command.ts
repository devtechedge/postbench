import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseCollection, parseEnvironment, serializeCollection, type Collection, type EnvironmentFile } from "@postbench/core";
import { CollectionRun, attachCliReporter, jsonReport, junitReport, parseDataFile, type RunSummary } from "@postbench/runner";

export interface RunFlags {
  environment?: string;
  globals?: string;
  iterationData?: string;
  iterationCount?: string;
  folder?: string[];
  envVar?: string[];
  globalVar?: string[];
  reporters?: string;
  reporterJsonExport?: string;
  reporterJunitExport?: string;
  exportEnvironment?: string;
  exportGlobals?: string;
  exportCollection?: string;
  delayRequest?: string;
  timeoutRequest?: string;
  timeoutScript?: string;
  bail?: boolean;
  insecure?: boolean;
  ignoreRedirects?: boolean;
  disableCookies?: boolean;
  workingDir?: string;
  suppressExitCode?: boolean;
  color?: string;
  verbose?: boolean;
  sslClientCert?: string;
  sslClientKey?: string;
  sslClientPassphrase?: string;
  sslExtraCaCerts?: string;
  proxy?: string;
}

async function load(source: string): Promise<string> {
  if (/^https?:\/\//.test(source)) {
    const r = await fetch(source);
    if (!r.ok) throw new Error(`Failed to fetch ${source}: ${r.status}`);
    return r.text();
  }
  return readFileSync(source, "utf8");
}

const kv = (list: string[] = []) =>
  Object.fromEntries(
    list.map((s) => {
      const i = s.indexOf("=");
      if (i < 1) throw new Error(`Expected key=value, got "${s}"`);
      return [s.slice(0, i), s.slice(i + 1)];
    }),
  );

function writeOut(path: string, text: string) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, text);
}

/** Executes `postbench run`; returns the process exit code. */
export async function runCommand(collectionPath: string, f: RunFlags, write: (s: string) => void = (s) => process.stdout.write(s)): Promise<{ code: number; summary: RunSummary }> {
  const parsed = parseCollection(await load(collectionPath));
  const collection: Collection = parsed.collection;
  const environment: EnvironmentFile | undefined = f.environment ? parseEnvironment(await load(f.environment)) : undefined;
  const globals: EnvironmentFile | undefined = f.globals ? parseEnvironment(await load(f.globals)) : undefined;
  const iterationData = f.iterationData ? parseDataFile(await load(f.iterationData), f.iterationData) : undefined;
  const reporters = (f.reporters ?? "cli").split(",").map((s) => s.trim()).filter(Boolean);
  const run = new CollectionRun(collection, {
    environment,
    globals,
    iterationData,
    iterationCount: f.iterationCount ? Number(f.iterationCount) : undefined,
    folder: f.folder,
    envVar: kv(f.envVar),
    globalVar: kv(f.globalVar),
    delayRequest: f.delayRequest ? Number(f.delayRequest) : undefined,
    timeoutRequest: f.timeoutRequest ? Number(f.timeoutRequest) : undefined,
    timeoutScript: f.timeoutScript ? Number(f.timeoutScript) : undefined,
    bail: f.bail,
    insecure: f.insecure,
    ignoreRedirects: f.ignoreRedirects,
    disableCookies: f.disableCookies,
    workingDir: f.workingDir ?? (/^https?:/.test(collectionPath) ? process.cwd() : dirname(resolve(collectionPath))),
    proxy: f.proxy ? { url: f.proxy } : undefined,
    tls: {
      cert: f.sslClientCert ? readFileSync(f.sslClientCert) : undefined,
      key: f.sslClientKey ? readFileSync(f.sslClientKey) : undefined,
      passphrase: f.sslClientPassphrase,
      ca: f.sslExtraCaCerts ? readFileSync(f.sslExtraCaCerts) : undefined,
    },
  });
  if (reporters.includes("cli")) attachCliReporter(run, { color: f.color !== "off" && !process.env.NO_COLOR, write, verbose: f.verbose });
  const summary = await run.start();
  if (reporters.includes("json")) writeOut(f.reporterJsonExport ?? `postbench/run-${Date.now()}.json`, JSON.stringify(jsonReport(summary, collection), null, 2));
  if (reporters.includes("junit")) writeOut(f.reporterJunitExport ?? `postbench/run-${Date.now()}.xml`, junitReport(summary));
  if (f.exportEnvironment) writeOut(f.exportEnvironment, serializeCollection(summary.environment.toEnvironment({ ...(environment ?? {}), name: environment?.name ?? "environment", _postman_variable_scope: "environment" })));
  if (f.exportGlobals) writeOut(f.exportGlobals, serializeCollection(summary.globals.toEnvironment({ ...(globals ?? {}), name: "globals", _postman_variable_scope: "globals" })));
  if (f.exportCollection) writeOut(f.exportCollection, serializeCollection({ ...collection, variable: summary.collectionVariables.toJSON() }, parsed.layout));
  const failed = summary.failures.length > 0 || !!summary.error;
  return { code: failed && !f.suppressExitCode ? 1 : 0, summary };
}
