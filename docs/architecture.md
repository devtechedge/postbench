# Architecture

Postbench is a pnpm and Turborepo monorepo written in TypeScript. Every
package is an ES module with its own Vitest suite.

```
packages/core         Collection v2.1 parse/serialize, environments, variable scopes and resolution, dynamic variables
packages/engine       Request preparation (pure, browser safe) and HTTP execution in Node (auth, cookies, redirects, proxies, TLS, timings)
packages/sandbox      pm.* script API in an isolated node:vm context (chai, lodash, crypto-js, legacy globals)
packages/runner       Collection runner: iterations, data files, folders, setNextRequest, bail, delays, events
packages/cli          `postbench` CLI: newman style `run`, plus `mock`, `import` and `codegen`
packages/importers    curl, HAR 1.2 and OpenAPI 3 to Collection v2.1
packages/codegen      Snippets for curl, fetch, Python requests and HTTPie
packages/mock         Mock server that replays saved examples
packages/echo         Local echo server used by tests (no network needed)
packages/conformance  Runs newman and postbench on the same collections and diffs results
apps/web              React UI (Vite). Runs in a browser or inside the desktop shell
apps/desktop          Electron shell. Bundles the web UI and bridges sends to the Node engine
tools/evidence        Scripts that turn REA output into committed, hashed evidence
```

## Data flow for one request

1. `core` parses the collection and builds variable scopes
   (local, data, environment, collection, globals).
2. `engine/prepare` resolves `{{vars}}`, merges inherited auth and protocol
   profile behaviour from parent folders, and produces a `PreparedRequest`,
   a plain JSON object.
3. The pre-request scripts of the collection, each parent folder and the item
   run in `sandbox`. Script edits to `pm.request` are applied, and the request
   is prepared again so new variables take effect.
4. `engine/send` signs (AWS SigV4, OAuth 1, Digest), encodes the body, sends it
   with Node `http`/`https`, follows redirects, stores cookies in a
   `tough-cookie` jar and records timing phases.
5. Test scripts run with `pm.response`; assertions and console output are
   recorded on the execution, and `runner` picks the next item (honouring
   `setNextRequest`).
6. Reporters (`cli`, `json`, `junit`) consume runner events.

## Web and desktop

`apps/web` only imports the browser safe part of the engine
(`@postbench/engine/prepare`) and the sandbox. In a plain browser the request
goes out through `fetch`, so it is subject to CORS and cannot sign requests
with Node crypto. In the desktop app, `preload.cjs` exposes
`window.postbenchDesktop.send`, which crosses IPC to the main process and runs
the full Node engine. The renderer has context isolation on and no Node access.

The desktop build (`apps/desktop/scripts/bundle.mjs`) bundles main and preload
into CommonJS with esbuild and copies `apps/web/dist` next to them;
electron-builder then produces an AppImage and a zip. CI uploads both as the
`postbench-linux` artifact.
