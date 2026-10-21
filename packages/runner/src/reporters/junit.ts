import type { RunSummary } from "../run.js";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

/** JUnit XML with one testsuite per executed request, like newman's junit reporter. */
export function junitReport(s: RunSummary): string {
  const name = s.collection.name;
  const total = s.executions.reduce((n, e) => n + e.assertions.length, 0);
  const time = ((s.timings.completed - s.timings.started) / 1000).toFixed(3);
  const out = [`<?xml version="1.0" encoding="UTF-8"?>`, `<testsuites name="${esc(name)}" tests="${total}" time="${time}">`];
  for (const e of s.executions) {
    const failures = e.assertions.filter((a) => !a.passed).length;
    const errors = e.scriptErrors.length + (e.requestError ? 1 : 0);
    const t = ((e.response?.responseTime ?? 0) / 1000).toFixed(3);
    const suiteName = e.item.path.join(" / ");
    out.push(`  <testsuite name="${esc(suiteName)}" id="${esc(e.item.id ?? e.id)}" timestamp="${new Date(s.timings.started).toISOString()}" tests="${e.assertions.length}" failures="${failures}" errors="${errors}" time="${t}">`);
    for (const a of e.assertions) {
      out.push(`    <testcase name="${esc(a.name)}" time="${t}" classname="${esc(name)}">`);
      if (a.skipped) out.push(`      <skipped/>`);
      else if (!a.passed) out.push(`      <failure type="AssertionFailure" message="${esc(a.error?.message ?? "")}">${cdata(`Failed ${e.cursor.iteration + 1} times.\nCollection name: ${name}.\nRequest name: ${e.item.name}.\nMessage: ${a.error?.message ?? ""}`)}</failure>`);
      out.push(`    </testcase>`);
    }
    for (const err of e.scriptErrors) out.push(`    <error type="${esc(err.name)}" message="${esc(err.message)}"/>`);
    if (e.requestError) out.push(`    <error type="RequestError" message="${esc(e.requestError.message)}"/>`);
    out.push(`  </testsuite>`);
  }
  out.push(`</testsuites>`);
  return out.join("\n") + "\n";
}
