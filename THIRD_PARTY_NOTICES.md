# Third party notices

Postbench is MIT licensed. It contains or is tested against the following
third party material. Postbench is not affiliated with or endorsed by
Postman, Inc. "Postman" is a trademark of Postman, Inc. and is used here only
to describe file format compatibility.

| Material | Location | License |
| --- | --- | --- |
| Postman Collection Format v2.1.0 JSON schema | `packages/core/src/schema/` | Apache-2.0 (postmanlabs/schemas) |
| newman integration test collections | `packages/core/test/fixtures/newman/`, `packages/conformance/` | Apache-2.0 (postmanlabs/newman) |
| Public collection exports | `packages/core/test/fixtures/exports/` (see `SOURCES.txt`) | MIT and CC0-1.0, per source repository |
| postman-collection, postman-sandbox, newman | dev dependencies used as test oracles only | Apache-2.0 |

No code, images or other assets from the Postman desktop application are
included. The `evidence/` directory holds only hashes, counts, identifiers
and short excerpts from bundled Apache-2.0 modules.
