# SPEC: Request engine

Evidence: facts `requester-gzip-brotli`, `timeout-min`, `max-redirects`,
`follow-redirects-opt`, `disable-body-pruning`.

## Behaviour
- Preparation (browser safe, `@postbench/engine/prepare`): substitute
  variables in URL parts, method, headers, body and auth; drop disabled
  headers, query params and form fields; resolve `:path` variables.
- Bodies: `raw` (Content-Type from `options.raw.language`, else
  `text/plain`), `urlencoded` (`+` for spaces), `formdata` (text and file
  parts, multiple files per key), `file` (binary), `graphql` (JSON body with
  `query` and parsed `variables`). An explicit Content-Type header wins.
- Body pruning: GET, HEAD, COPY, PURGE and UNLOCK requests drop their body
  unless `protocolProfileBehavior.disableBodyPruning` is true.
- Default headers when absent: User-Agent, Accept `*/*`,
  Accept-Encoding `gzip, deflate, br`. Responses are decoded for gzip,
  deflate (zlib or raw) and brotli, matching the runtime which always
  enables gzip and brotli.
- Redirects are followed by default, up to `maxRedirects` (10). 301, 302
  and 303 switch to GET and drop the body unless `followOriginalHttpMethod`;
  307 and 308 keep method and body. Authorization is dropped on cross
  origin hops unless `followAuthorizationHeader`.
- `protocolProfileBehavior` merges collection, then folders, then item.
- Timeouts: a single request timeout; the runtime uses the minimum of the
  request and global timeouts.
- TLS: `strictSSL: false` disables certificate verification; client
  certificate, key, CA and passphrase are supported.
- Proxies: plain HTTP uses absolute-form targets, HTTPS uses CONNECT; basic
  proxy credentials from the proxy URL; host bypass list.
- Timings are reported as phases: wait, dns, tcp, secureHandshake,
  firstByte, download, total (milliseconds).

## Quirks
- Postman also sends a `Postman-Token` header and its own User-Agent;
  Postbench sends `PostbenchRuntime/<version>` and no token header.

## Unknowns
- HTTP/2 negotiation and NTLM are not implemented.
