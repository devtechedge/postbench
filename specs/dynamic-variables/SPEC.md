# SPEC: Dynamic variables

Evidence: facts `dyn-guid`, `dyn-timestamp`, `dyn-randomint`; the full list
of 117 names was read from the bundled postman-collection module.

## Behaviour
- `{{$name}}` resolves to a freshly generated value per occurrence.
- A user variable with the same name (for example `$guid`) shadows the
  generator.
- `$guid`/`$randomUUID`: v4 UUID. `$timestamp`: Unix seconds, rounded.
  `$isoTimestamp`: ISO-8601 UTC. `$randomInt`: integer 0..1000 inclusive.
- All other `$random*` names produce values of the same shape (email,
  name, IP, colour and so on) from Postbench's own word lists. The exact
  values differ from Postman's faker-based output by design.

## Unknowns
- Locale specific output of the faker data in Postman is not reproduced.
