#!/usr/bin/env node
// Records small, located observations from an extracted desktop app tree.
// Each fact stores the file path, file SHA-256, byte offset and a short
// excerpt so a reviewer can re-locate it. Only facts from bundled
// open-source (Apache-2.0) modules or plain identifiers are recorded.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , appDir, factsFile, outFile] = process.argv;
if (!appDir || !factsFile || !outFile) {
  console.error("usage: probe.mjs <app-dir> <facts.json> <out.json>");
  process.exit(2);
}
const queries = JSON.parse(readFileSync(factsFile, "utf8"));
const files = readdirSync(appDir).filter((f) => f.endsWith(".js"));
const cache = new Map();
function load(f) {
  if (!cache.has(f)) {
    const buf = readFileSync(join(appDir, f));
    cache.set(f, { text: buf.toString("utf8"), sha256: createHash("sha256").update(buf).digest("hex") });
  }
  return cache.get(f);
}
const facts = [];
for (const q of queries) {
  const re = new RegExp(q.pattern, "g");
  const hits = [];
  for (const f of files.filter((n) => n.includes(q.file ?? ""))) {
    const { text, sha256 } = load(f);
    for (const m of text.matchAll(re)) {
      hits.push({
        file: f,
        file_sha256: sha256,
        byte_offset: Buffer.byteLength(text.slice(0, m.index)),
        excerpt: m[0].slice(0, 240),
      });
      if (hits.length >= (q.max ?? 3)) break;
    }
    if (hits.length >= (q.max ?? 3)) break;
  }
  facts.push({ id: q.id, feature: q.feature, claim: q.claim, pattern: q.pattern, hits });
}
const body = JSON.stringify({ app_dir_name: "resources/app", facts }, null, 2);
writeFileSync(outFile, body + "\n");
console.log(`${facts.length} facts, ${facts.filter((f) => f.hits.length).length} located, sha256 ${createHash("sha256").update(body + "\n").digest("hex")}`);
