# SPEC: Script sandbox

Evidence: facts `var-scope-list`, `var-scopes-tracked`, `test-tracks-tests`;
behaviour checked by differential tests against postman-sandbox
(`packages/sandbox/test/differential.test.ts`).

## Behaviour
- Each script runs in a fresh `node:vm` context; globals do not leak between
  scripts. Code is wrapped in an async function so top-level `await` works.
- `pm.environment`, `pm.globals`, `pm.collectionVariables`: get, set, unset,
  has, clear, toObject, replaceIn. Writes persist for the rest of the run.
- `pm.variables.get` resolves across all scopes, narrowest first;
  `pm.variables.set` writes the local scope, which lives for one request.
- `pm.iterationData`: read-only view of the current data row.
- `pm.request`: url (getHost, getPath, query list, toString, assignable),
  method, headers (get, has, add, upsert, remove, toObject). Changes made in
  a pre-request script are applied to the request that is sent.
- `pm.response`: code, status, headers, responseTime, responseSize, text(),
  json(), and chai helpers `to.have.status(code|reason)`, `to.be.ok`,
  `success`, `clientError`, `serverError`, `notFound`, `error`,
  `to.have.header(k[, v])`, `to.have.body(...)`, `to.have.jsonBody(...)`,
  `to.be.json`.
- `pm.test(name, fn)`: sync, `done` callback and promise styles.
  `pm.test.skip` records a skipped assertion that counts as passed.
- Async assertions are reported in completion order, not declaration order
  (found by the differential test).
- Legacy globals: `tests[...]` (reported after `pm.test` results),
  `responseBody`, `responseCode`, `responseHeaders`, `responseTime`,
  `environment`, `globals`, `data`, `request`, `postman.*` setters and
  `postman.setNextRequest`.
- `pm.execution.setNextRequest(name|null)`, `pm.execution.skipRequest()`,
  `pm.visualizer.set(template, data)`, `pm.sendRequest(req, cb?)` returning a
  promise.
- `require`: `chai`, `lodash`, `crypto-js`, `uuid`, `atob`, `btoa`.
- A runtime error stops the script; assertions recorded before it are kept
  and the error is reported separately.

## Unknowns
- Other sandbox libraries (`moment`, `cheerio`, `xml2js`, `ajv`, `tv4`,
  `csv-parse`) are not bundled yet.
- `pm.vault`, `pm.require` of package library modules and
  `pm.cookies.jar()` writes need Postman cloud features.
