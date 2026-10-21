# SPEC: Collection format

Sources: public Collection v2.1.0 JSON schema; postman-collection SDK
(Apache-2.0) as a test oracle; real exports in
`packages/core/test/fixtures/exports`.

## Behaviour
- A collection is `{ info, item[], event?, variable?, auth?, protocolProfileBehavior? }`.
  Items with an `item` array are folders; everything else is a request item.
- `info.schema` selects the version. v2.0 and v2.1 share the item model and
  are both accepted. v1 (`requests[]`, `folders[]`) is rejected with a clear
  message.
- Postman writes exports with `JSON.stringify(value, null, "\t")` and no
  trailing newline. Postbench keeps the parsed JSON object as is (unknown
  keys survive) and records indent, BOM, CRLF and trailing newline, so every
  real export in the fixture set re-serializes byte for byte.
- `request` may be a bare URL string; `url` may be a string or an object.
- Run order is depth-first over `item`.

## Quirks
- Byte stability holds only for documents that are already canonical
  `JSON.stringify` output. Hand-written JSON with `1.0` or `\u00e9`
  escapes round-trips to equal JSON, not equal bytes.
- The SDK keeps URL userinfo (`user:pw@host`) on `url.auth`, which is not
  part of the schema. Postbench does the same.

## Unknowns
- Whether newer desktop builds write any keys outside the v2.1 schema on
  export (none were seen in the six exports in the fixture set beyond
  `_exporter_id` and `_collection_link`).
