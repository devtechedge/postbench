# SPEC: Variables

Evidence: `evidence/postman-12.33.2/facts.json.gz` facts
`var-scope-list`, `var-resolution-order`, `var-scopes-tracked`,
`var-syntax`, `var-max-depth`.

## Behaviour
- Reference syntax is `{{name}}`, matched by `/{{([^{}]*?)}}/g`
  (fact `var-syntax`). Names may contain spaces and dots.
- Resolution order, narrowest first: local (`pm.variables.set`), iteration
  data, environment, collection, globals (fact `var-resolution-order`
  shows `_variables, data, environment, collectionVariables, globals`;
  `vaultSecrets` follows and is out of scope).
- Substitution re-scans for nested references and stops after 19 passes
  (fact `var-max-depth`: `VARS_SUBREPLACE_LIMIT:19`), so a self-referencing
  variable terminates.
- Unresolved references stay in the output verbatim.
- Values are coerced with `String()`: objects become `[object Object]`
  (found by the SDK differential test, not intuitive).
- Disabled entries are ignored; with duplicate keys the last enabled one
  wins.
- Scripts may write to globals, environment and collection variables, which
  the runtime tracks and writes back after each script (fact
  `var-scopes-tracked`).

## Unknowns
- Vault secrets (`{{vault:...}}`) need a Postman account and are not
  implemented.
