# Limitations

Known gaps in v0.1.0. Each one is either a deliberate scope cut or listed in a
SPEC under "Unknowns".

## Formats
- Collection v1 files are rejected with a request to re-export as v2.1
  (newman 4+ deprecates v1 as well).
- Postman API only features (workspaces, monitors, mock servers in the cloud,
  team sync) are out of scope. Postbench is local first.

## Request engine
- No WebSocket, Socket.IO, gRPC or MQTT requests. GraphQL is supported as an
  HTTP body mode and in the mock server.
- No NTLM, Hawk, Akamai EdgeGrid or ASAP auth signing. OAuth 2 uses an
  existing access token; the interactive token flows are not implemented.
- HTTP/2 is not negotiated; requests use HTTP/1.1.

## Sandbox
- `require` supports `lodash`, `crypto-js`, `chai`, `uuid`, `atob` and `btoa`.
  Other bundled Postman libraries (`ajv`, `tv4`, `cheerio`, `xml2js`,
  `moment`, `csv-parse`) are not available yet, which explains most of the
  remaining conformance differences.
- Array helpers that old Postman sandboxes added to `Array.prototype` are not
  installed.
- The `node:vm` context is an isolation boundary for globals, not a security
  sandbox. Only run scripts you trust, the same as with newman.

## Web demo
- Browser requests go through `fetch`, so the target must allow CORS, and
  AWS SigV4, OAuth 1 and Digest auth only work in the desktop app or the CLI.
- Workspace state is stored in `localStorage` of the browser.

## Packaging
- Only Linux builds (AppImage and zip) are produced in CI. The Electron shell
  is not signed.
