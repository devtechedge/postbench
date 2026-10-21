# Compatibility matrix

Status against the Postman desktop app and newman 6.2.3.
Supported means implemented and covered by tests; Partial means the common
path works with the noted gaps; Not yet means not implemented in v0.1.0.

## Data formats

| Feature | Status | Notes |
| --- | --- | --- |
| Collection v2.1 import | Supported | Validated against the public v2.1.0 JSON schema |
| Collection v2.1 export | Supported | Byte stable round trip on real exports (`packages/core/test/roundtrip.test.ts`) |
| Collection v2.0 | Supported | Read as v2.1 |
| Collection v1 | Not yet | Rejected with a re-export hint, like newman 4+ |
| Environment and globals files | Supported | Including `enabled: false` and `disabled: true`, BOM and UTF-16 LE files |
| Data files (CSV, JSON) | Supported | newman CSV quirks: BOM, trimming, numeric casting |
| curl, HAR 1.2, OpenAPI 3 import | Supported | OpenAPI operations grouped into folders by tag |

## Variables

| Feature | Status | Notes |
| --- | --- | --- |
| Scope precedence local > data > environment > collection > globals | Supported | `specs/variables/SPEC.md` |
| Nested and recursive `{{var}}` resolution | Supported | |
| Dynamic variables (`$guid`, `$timestamp`, `$randomInt`, `$random*`) | Supported | `specs/dynamic-variables/SPEC.md` |
| Secret variable type | Partial | Stored and resolved; not masked in the CLI reporter |

## Requests

| Feature | Status | Notes |
| --- | --- | --- |
| Methods incl. custom verbs | Supported | |
| Bodies: raw, JSON, urlencoded, form-data, binary file, GraphQL | Supported | |
| Auth: none, inherit, Basic, Bearer, API key, OAuth 2 (token), OAuth 1, Digest, AWS SigV4 | Supported | Browser demo: Basic, Bearer, API key and OAuth 2 only |
| Auth: Hawk, NTLM, Akamai EdgeGrid, ASAP, JWT | Not yet | |
| Cookies jar across a run | Supported | `tough-cookie` |
| Redirects, max redirects, protocol profile behaviour | Supported | |
| Proxy, client certificates, extra CA, insecure TLS | Supported | CLI and desktop |
| Timing phases (dns, tcp, tls, firstByte, download) | Supported | |
| gzip, deflate, brotli responses | Supported | |
| WebSocket, gRPC, Socket.IO, MQTT | Not yet | |

## Scripts

| Feature | Status | Notes |
| --- | --- | --- |
| `pm.environment`, `pm.globals`, `pm.collectionVariables`, `pm.variables`, `pm.iterationData` | Supported | |
| `pm.request` editing in pre-request scripts | Supported | |
| `pm.response` with chai helpers, `pm.expect`, `pm.test` (sync, done, promise) | Supported | Differential tests against postman-sandbox |
| `pm.sendRequest` | Supported | |
| `pm.execution.setNextRequest`, `postman.setNextRequest`, skip request | Supported | |
| `pm.visualizer.set` | Supported | Template and data are recorded |
| Legacy `tests[]`, `responseBody`, `postman.*` | Supported | Legacy `environment`/`globals` objects track writes |
| `require`: lodash, crypto-js, chai, uuid, atob, btoa | Supported | |
| `require`: ajv, tv4, cheerio, xml2js, moment, csv-parse | Not yet | |

## Runner and CLI

| Feature | Status | Notes |
| --- | --- | --- |
| newman flags (`-e -g -d -n --folder --env-var --global-var --bail --delay-request --timeout-* -k --export-*`) | Supported | `postbench run --help` |
| Reporters: cli, json, junit | Supported | |
| Mock server from saved examples | Supported | `x-mock-response-name`, `x-mock-response-code`, `x-mock-response-delay`, GraphQL operation matching |

## Conformance

See [`packages/conformance/results/REPORT.md`](../packages/conformance/results/REPORT.md)
for per-collection results on the newman integration suite.
