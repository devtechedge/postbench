# Evidence: Postman desktop 12.33.2 (Linux x64)

Collected on 2026-10-21 for interoperability research only. No Postman code,
assets or branding are redistributed; only hashes, counts, identifiers and
short excerpts from bundled Apache-2.0 modules (postman-collection,
postman-runtime) are recorded.

| Item | SHA-256 |
| --- | --- |
| Download `https://dl.pstmn.io/download/latest/linux_64` (tar.gz, 208018794 bytes) | `e374f14effa607f63d6259354e47ff322b6e0c77a60f6ceedc9bf3af55577f04` |
| `resources/app` directory digest (REA subject) | `41668dfbe115854affc4440057a394597f7b20e773e7e8667321f2005460e187` |
| Full REA output (`rea analyze-javascript-application`, 148984774 bytes, not committed) | `21fc94ac5cba92679d675c1157e60a7e87d77f8ea6e6db25e88c52ac758e4e48` |
| `rea-analyze-javascript-application.json.gz` (projection) | `0ec5f28753d37e12a509a4c7cfea755d9b61352e694f7940d7e3db5c2ace259e` |
| `facts.json.gz` (22 located facts) | `9d59dbcaf868d79cf249d577c052ae5e2bbe74eb4bdf0268b3638470f288439d` |

The desktop build ships an unpacked `resources/app` directory rather than an
`app.asar`, so REA ran with `--artifact-format auto` on the directory.

## Reproduce

```sh
curl -L -o postman.tar.gz https://dl.pstmn.io/download/latest/linux_64
tar xzf postman.tar.gz
A=Postman/app/resources/app
rea analyze-javascript-application "$A" --format json --max-heap-mb 3072 \
  --source-path vendors-node_modules_postman-collection_index_js-c1e28db3b3a8431e.min.js \
  --source-path vendors-node_modules_postman-runtime_index_js-f9f564bf4a98757b.min.js \
  --source-path main.js > app-graph.json
node tools/evidence/project-rea.mjs app-graph.json rea-analyze-javascript-application.json.gz
node tools/evidence/probe.mjs "$A" tools/evidence/facts.json facts.json
```

`latest` moves, so a later download will hash differently; the facts are
anchored by per-file SHA-256 and byte offset.

REA's `search`, `xrefs` and `trace-application-feature` string search paths
target native binaries (Ghidra/Hopper/IDA providers); on this JavaScript
target `rea search` returns `capability_unavailable`, so located facts were
collected by `probe.mjs` instead and are tied to the same file hashes.
