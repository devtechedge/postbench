#!/usr/bin/env node
// Reduces a full `rea analyze-javascript-application --format json` result
// to a reviewable projection, keeping the SHA-256 of the full output so the
// projection can be tied back to the original run.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const [, , input, output] = process.argv;
const raw = readFileSync(input);
const ev = JSON.parse(raw.toString("utf8"));
const n = ev.normalized_result;
const sg = n.semantic_graph;
const projection = {
  rea_output_sha256: createHash("sha256").update(raw).digest("hex"),
  rea_output_bytes: raw.length,
  evidence_id: ev.evidence_id,
  operation: ev.operation,
  provider: ev.provider,
  subject: { ...ev.subject, local_path: undefined },
  parameters: ev.parameters,
  root_artifact_sha256: n.root_artifact_sha256,
  inventory_manifest_id: n.inventory_manifest_id,
  inventory_graph_sha256: n.inventory_graph_sha256,
  source_selection: n.source_selection,
  summary: n.summary,
  statistics: n.statistics,
  semantic_graph: {
    graph_id: sg.graph_id,
    nodes: sg.nodes.length,
    relations: sg.relations.length,
    fingerprints: sg.fingerprints.length,
    unknowns: sg.unknowns.length,
    coverage_keys: Object.keys(sg.coverage ?? {}),
  },
  limitations: ev.limitations,
};
const body = JSON.stringify(projection, null, 2) + "\n";
writeFileSync(output, gzipSync(body));
console.log(`${output} sha256(json)=${createHash("sha256").update(body).digest("hex")}`);
