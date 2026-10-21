# SPEC: Auth helpers

Evidence: facts `auth-types` (runtime handler set: noauth, awsv4, basic,
bearer, hawk, oauth1, oauth2, apikey, edgegrid), `digest-qop`,
`oauth2-header-prefix`, `apikey-in`.

## Behaviour
- Inheritance: request auth wins; a missing or `null` auth inherits from
  the nearest folder, then the collection; `noauth` stops inheritance.
- Auth params are `[{key, value}]` lists and are variable-substituted.
- Basic: `Authorization: Basic base64(user:pass)`.
- Bearer: `Authorization: Bearer <token>`.
- API key: header by default, query when `in` is `query`; an empty key is
  ignored (the runtime throws `empty key in "API Key" auth`).
- OAuth 2.0: uses an existing `accessToken`; prefix from `headerPrefix`,
  default `Bearer`; `addTokenTo: queryParams` adds `access_token`.
- Digest: send once, on `401` with a `Digest` challenge replay with
  `nc=00000001`; MD5, MD5-sess, SHA-256, SHA-256-sess; qop `auth` and
  `auth-int`.
- AWS SigV4: signed with the MIT `aws4` library from `accessKey`,
  `secretKey`, `sessionToken`, `region`, `service`.
- OAuth 1.0a: HMAC-SHA1, HMAC-SHA256, PLAINTEXT, signature in the header;
  verified against the RFC 5849 example.

## Unknowns
- Hawk, Akamai EdgeGrid, NTLM, JWT and ASAP signing are not implemented.
- The interactive OAuth 2.0 token fetch flow (browser window) is not
  implemented; tokens must be pasted or set by script.
