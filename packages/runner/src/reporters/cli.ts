import type { CollectionRun, ExecutionRecord, RunSummary } from "../run.js";

export interface CliReporterOptions {
  color?: boolean;
  write?: (s: string) => void;
  verbose?: boolean;
}

const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));
const padL = (s: string, n: number) => (s.length >= n ? s : " ".repeat(n - s.length) + s);

/** Streams a newman style console report while the run progresses. */
export function attachCliReporter(run: CollectionRun, opts: CliReporterOptions = {}): void {
  const color = opts.color ?? true;
  const w = opts.write ?? ((s: string) => process.stdout.write(s));
  const c = (code: number, s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const green = (s: string) => c(32, s);
  const red = (s: string) => c(31, s);
  const gray = (s: string) => c(90, s);
  let failureIndex = 0;
  let lastFolder = "";

  run.on("start", ({ collection }) => w(`postbench\n\n${collection.info.name}\n`));
  run.on("beforeIteration", ({ iteration }) => {
    if (run.options.iterationCount && run.options.iterationCount > 1 || (run.options.iterationData?.length ?? 0) > 1) w(`\nIteration ${iteration + 1}\n`);
  });
  run.on("beforeItem", ({ item }) => {
    void item;
  });
  run.on("item", ({ execution }: { execution: ExecutionRecord }) => {
    const folder = execution.item.path.slice(0, -1).join(" / ");
    if (folder && folder !== lastFolder) w(`\n\u2751 ${folder}\n`);
    lastFolder = folder;
    w(`\u21b3 ${execution.item.name}\n`);
    if (execution.skipped) w(gray("  [skipped]\n"));
    if (execution.request) {
      const r = execution.response;
      const meta = r ? ` [${r.code} ${r.status}, ${r.responseSize}B, ${r.responseTime}ms]` : "";
      w(`  ${execution.request.method} ${execution.request.url}${r ? gray(meta) : ""}\n`);
    }
    if (execution.requestError) w(red(`  ${++failureIndex}. ${execution.requestError.message}\n`));
    for (const e of execution.scriptErrors) w(red(`  ${++failureIndex}. ${e.name} in ${e.event}-script: ${e.message}\n`));
    for (const a of execution.assertions) {
      if (a.skipped) w(gray(`  - ${a.name}\n`));
      else if (a.passed) w(`  ${green("\u2713")}  ${a.name}\n`);
      else w(red(`  ${++failureIndex}. ${a.name}\n`));
    }
    if (opts.verbose) for (const l of execution.console) w(gray(`  \u2502 ${l.messages.map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join(" ")}\n`));
  });
  run.on("done", (s: RunSummary) => w(`\n${summaryTable(s)}\n${failureList(s, red)}`));
}

export function summaryTable(s: RunSummary): string {
  const rows: [string, { total: number; failed: number }][] = [
    ["iterations", s.stats.iterations],
    ["requests", s.stats.requests],
    ["test-scripts", s.stats.testScripts],
    ["prerequest-scripts", s.stats.prerequestScripts],
    ["assertions", s.stats.assertions],
  ];
  const line = "\u251c" + "\u2500".repeat(29) + "\u253c" + "\u2500".repeat(20) + "\u253c" + "\u2500".repeat(19) + "\u2524";
  const out = ["\u250c" + "\u2500".repeat(29) + "\u252c" + "\u2500".repeat(20) + "\u252c" + "\u2500".repeat(19) + "\u2510", `\u2502${pad("", 29)}\u2502${padL("executed", 19)} \u2502${padL("failed", 18)} \u2502`, line];
  for (const [k, v] of rows) out.push(`\u2502${padL(k, 28)} \u2502${padL(String(v.total), 19)} \u2502${padL(String(v.failed), 18)} \u2502`);
  out.push(line);
  const dur = s.timings.completed - s.timings.started;
  out.push(`\u2502 total run duration: ${dur}ms`.padEnd(71) + "\u2502");
  out.push(`\u2502 average response time: ${Math.round(s.timings.responseAverage)}ms [min: ${s.timings.responseMin}ms, max: ${s.timings.responseMax}ms]`.padEnd(71) + "\u2502");
  out.push("\u2514" + "\u2500".repeat(70) + "\u2518");
  return out.join("\n") + "\n";
}

function failureList(s: RunSummary, red: (s: string) => string): string {
  if (!s.failures.length) return "";
  const lines = ["", "  #  failure         detail", ""];
  s.failures.forEach((f, i) => {
    lines.push(red(` ${String(i + 1).padStart(2)}.  ${f.error.name.padEnd(14)} ${f.error.test ?? f.at}`));
    lines.push(`                      ${f.error.message}`);
    lines.push(`                      at ${f.at}`);
    lines.push(`                      inside "${f.source}"`, "");
  });
  return lines.join("\n") + "\n";
}
