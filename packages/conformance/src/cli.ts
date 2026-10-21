#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { markdown, runAll } from "./conformance.js";

const root = fileURLToPath(new URL("../collections", import.meta.url));
const out = fileURLToPath(new URL("../results", import.meta.url));
const report = await runAll(root);
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + "\n");
writeFileSync(`${out}/REPORT.md`, markdown(report));
const t = report.totals;
console.log(`collections ${t.cases}: ${t.match} identical, ${t.mismatch} different, ${t.unsupported} unsupported, ${t.error} errors; assertions ${t.matchedAssertions}/${t.newmanAssertions}`);
