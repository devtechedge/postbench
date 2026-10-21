# SPEC: Cookies

Evidence: fact `cookie-jar` (runtime places a cookie jar on
`requester.cookieJar`).

## Behaviour
- One jar per run (RFC 6265 via tough-cookie). `Set-Cookie` is stored on
  every hop, including redirect responses, and matching cookies are sent on
  the next hop.
- `protocolProfileBehavior.disableCookies` skips the jar for an item.
- An explicit `Cookie` header in the request is kept and the jar is not
  consulted for that hop.
- `pm.cookies` exposes cookies for the response URL to test scripts.

## Unknowns
- Domain allow-listing for script access to the jar (`pm.cookies.jar()`
  whitelisting in Postman) is not implemented; scripts read cookies only.
