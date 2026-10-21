# Evidence format

Behaviour that Postbench copies from Postman is backed by evidence collected
with [REA](https://github.com/morluto/rea) from the Postman desktop app for
Linux, plus the Apache-2.0 sources of postman-collection, postman-runtime,
postman-sandbox and newman. Evidence lives in `evidence/<subject>-<version>/`.

## Files

| File | Content |
| --- | --- |
| `MANIFEST.md` | Subject, download URL, SHA-256 of the download, of the analysed directory and of the full REA output, plus the exact commands to reproduce |
| `SHA256SUMS` | `sha256sum -c` compatible list of the committed evidence files |
| `rea-analyze-javascript-application.json.gz` | Projection of the REA result produced by `tools/evidence/project-rea.mjs` |
| `facts.json.gz` | Located facts produced by `tools/evidence/probe.mjs` from `tools/evidence/facts.json` |

The full REA output (about 149 MB) is not committed. The projection records
its SHA-256 and size in `rea_output_sha256` and `rea_output_bytes`, so anyone
who reruns the documented command can prove the projection came from it.

## Projection fields

`evidence_id`, `operation`, `provider`, `subject` (with the local path
removed), `parameters`, `root_artifact_sha256`, `inventory_manifest_id`,
`inventory_graph_sha256`, `source_selection`, `summary`, `statistics`,
`semantic_graph` (counts of nodes, relations, fingerprints and unknowns, and
the coverage keys) and `limitations`, all copied from REA.

## Facts

Each fact is a claim about observable behaviour and the places it was found:

```json
{
  "id": "var-scopes-tracked",
  "feature": "variables",
  "claim": "Scripts can mutate the globals, environment and collectionVariables scopes ...",
  "pattern": "trackContext:\\[\"globals\",\"environment\",\"collectionVariables\"\\]",
  "hits": [
    { "file": "postman-runtime-<hash>.min.js", "file_sha256": "1fce...", "byte_offset": 84957, "excerpt": "trackContext:[...]" }
  ]
}
```

Excerpts are limited to short matches from bundled Apache-2.0 modules. No
proprietary code or assets are stored.

## Specs

Every feature has `specs/<feature>/SPEC.md` with the behaviour Postbench
implements, the fact ids and tests that back it, known quirks and open
unknowns. Tests reference the same ids, so a claim can be traced from the
spec to the evidence file and byte offset.

## Verifying

```sh
sha256sum -c evidence/postman-12.33.2/SHA256SUMS
zcat evidence/postman-12.33.2/facts.json.gz | jq '.facts[].id'
```
