# Conformance report

Reference: newman 6.2.3. Generated 2026-10-21T19:04:49.644Z.

| Metric | Value |
| --- | --- |
| Collections | 45 |
| Identical results | 26 |
| Differences | 15 |
| Unsupported (v1 format) | 3 |
| Errors | 1 |
| Assertions matched | 215 / 286 (75.2%) |

| Collection | Result | newman assertions (failed) | postbench assertions (failed) |
| --- | --- | --- | --- |
| newman/bom-and-encoding/bom-in-collection-file.postman_collection.json | match | 2 (0) | 2 (0) |
| newman/bom-and-encoding/bom-in-environment-file.postman_collection.json | match | 2 (0) | 2 (0) |
| newman/bom-and-encoding/utf16-le-encoding-in-env.postman_collection.json | match | 2 (0) | 2 (0) |
| newman/case-insen-header-sandbox.postman_collection.json | match | 1 (0) | 1 (0) |
| newman/clear-vars-sandbox.postman_collection.json | mismatch | 7 (0) | 7 (1) |
| newman/comma-test-csv/comma-test-csv.postman_collection.json | match | 1 (0) | 1 (0) |
| newman/cookie-jar.postman_collection.json | match | 2 (0) | 2 (0) |
| newman/crypto-md5.postman_collection.json | match | 1 (0) | 1 (0) |
| newman/csv-with-bom/csv-with-bom.postman_collection.json | mismatch | 1 (0) | 1 (1) |
| newman/custom-http-method/custom-http-method.postman_collection.json | match | 9 (9) | 9 (9) |
| newman/data-file-var-replacement/data-file-var-replacement.postman_collection.json | match | 0 (0) | 0 (0) |
| newman/disabled-and-duplicate-variables/disabled-and-duplicates.postman_collection.json | mismatch | 3 (0) | 3 (2) |
| newman/distinct-random-int.postman_collection.json | match | 1 (0) | 1 (0) |
| newman/dynamic-var-replacement.postman_collection.json | match | 3 (0) | 3 (0) |
| newman/echo-v2.postman_collection.json | mismatch | 64 (12) | 64 (11) |
| newman/esc-formdata/esc-formdata.postman_collection.json | match | 2 (0) | 2 (0) |
| newman/globals-env-data-files/globals-env-data-files.postman_collection.json | match | 9 (0) | 9 (0) |
| newman/hawk-auth-test.postman_collection.json | match | 1 (1) | 1 (1) |
| newman/head-requests.postman_collection.json | mismatch | 3 (3) | 1 (1) |
| newman/helper.postman_collection.json | mismatch | 3 (0) | 3 (3) |
| newman/inherited-entities/inherited-entities.postman_collection.json | unsupported: Not a Postman collection: expected info and item[] | 7 (0) | 0 (0) |
| newman/multi-level-folders-v1.postman_collection.json | unsupported: Collection format v1 is not supported; re-export as v2.1 | 12 (0) | 0 (0) |
| newman/multi-level-folders-v2.postman_collection.json | mismatch | 12 (0) | 12 (5) |
| newman/multi-value-data.postman_collection.json | mismatch | 1 (0) | 0 (0) |
| newman/multiple-form-values.postman_collection.json | match | 3 (0) | 3 (0) |
| newman/newman-gzip-test.postman_collection.json | match | 1 (1) | 1 (1) |
| newman/oauth1-var-in-url-params.postman_collection.json | match | 0 (0) | 0 (0) |
| newman/protocol-profile-behavior.postman_collection.json | match | 2 (2) | 2 (2) |
| newman/prototype-check.postman_collection.json | mismatch | 15 (0) | 0 (0) |
| newman/redirect-test/redirect-test.postman_collection.json | match | 0 (0) | 0 (0) |
| newman/redirect-test/redirect-with-body.postman_collection.json | match | 0 (0) | 0 (0) |
| newman/request-body-with-get.postman_collection.json | match | 3 (3) | 3 (3) |
| newman/request-chaining-test.postman_collection.json | match | 7 (0) | 7 (0) |
| newman/request-name-in-script.postman_collection.json | mismatch | 1 (0) | 1 (1) |
| newman/sandbox-libraries.postman_collection.json | mismatch | 10 (0) | 8 (8) |
| newman/semicolon-tests.postman_collection.json | match | 2 (2) | 2 (2) |
| newman/set-next-request.postman_collection.json | error: timed out after 30000 ms | 0 (0) | 0 (0) |
| newman/slashed-variable-names/slashed-variable-names.postman_collection.json | match | 3 (0) | 3 (0) |
| newman/steph/steph.postman_collection.json | match | 4 (0) | 4 (0) |
| newman/super-sandbox-test.postman_collection.json | mismatch | 26 (1) | 24 (1) |
| newman/tc4/tc4.postman_collection.json | mismatch | 1 (1) | 0 (0) |
| newman/timeout/timeout.postman_collection.json | unsupported: Not a Postman collection: expected info and item[] | 0 (0) | 0 (0) |
| newman/v2-regression-tests/v2-regression-tests.postman_collection.json | mismatch | 5 (1) | 4 (0) |
| newman/var-replacement.postman_collection.json | match | 2 (0) | 2 (0) |
| newman/whatwg-url.postman_collection.json | mismatch | 52 (10) | 52 (14) |

## Differences

### newman/clear-vars-sandbox.postman_collection.json

- step 1 "After clearing" assertion 2: ["Recreated vars",true] vs ["Recreated vars",false]

### newman/csv-with-bom/csv-with-bom.postman_collection.json

- step 0: item "undefined" vs ""
- step 0 "undefined" assertion 0: ["CSV parsing tests",true] vs ["CSV parsing tests",false]

### newman/disabled-and-duplicate-variables/disabled-and-duplicates.postman_collection.json

- step 0 "http://127.0.0.1:35765/get" assertion 0: ["Disabled variable",true] vs ["Disabled variable",false]
- step 0 "http://127.0.0.1:35765/get" assertion 1: ["1 Enabled and 1 Disabled variable",true] vs ["1 Enabled and 1 Disabled variable",false]

### newman/echo-v2.postman_collection.json

- step 6 "Delete Cookies" assertion 2: ["Body does not contain cookie foo2",false] vs ["Body does not contain cookie foo2",true]

### newman/head-requests.postman_collection.json

- step 0 "google" assertion 0: ["Status is 200 OK",false] vs null
- step 1 "github" assertion 0: ["Status is 200 OK",false] vs null

### newman/helper.postman_collection.json

- step 0 "OAuth" assertion 0: ["should authorize correctly",true] vs ["should authorize correctly",false]
- step 1 "basicAuth" assertion 0: ["Should authorize correctly",true] vs ["Should authorize correctly",false]
- step 2 "DigestAuth" assertion 0: ["should authorize correctly",true] vs ["should authorize correctly",false]
- step 3: newman ran "DigestAuth" only

### newman/multi-level-folders-v2.postman_collection.json

- step 1 "F1.R2" assertion 1: ["Request executed in correct order",true] vs ["Request executed in correct order",false]
- step 2 "F1.R3" assertion 1: ["Request executed in correct order",true] vs ["Request executed in correct order",false]
- step 3 "F2.F3.R1" assertion 1: ["Request executed in correct order",true] vs ["Request executed in correct order",false]
- step 4 "F2.R1" assertion 1: ["Request executed in correct order",true] vs ["Request executed in correct order",false]
- step 5 "R1" assertion 1: ["Request executed in correct order",true] vs ["Request executed in correct order",false]

### newman/multi-value-data.postman_collection.json

- step 0 "r1" assertion 0: ["request data array correct",true] vs null

### newman/prototype-check.postman_collection.json

- step 0 "objectPrototype" assertion 0: ["Array prototype none",true] vs null
- step 0 "objectPrototype" assertion 1: ["Array prototype any",true] vs null
- step 0 "objectPrototype" assertion 2: ["Array prototype average",true] vs null
- step 0 "objectPrototype" assertion 3: ["Date prototype getTime",true] vs null
- step 0 "objectPrototype" assertion 4: ["Function prototype once",true] vs null
- step 0 "objectPrototype" assertion 5: ["Number prototype hex",true] vs null
- step 0 "objectPrototype" assertion 6: ["Number prototype isEven",true] vs null
- step 0 "objectPrototype" assertion 7: ["Number prototype ordinalize",true] vs null
- step 0 "objectPrototype" assertion 8: ["Number prototype format",true] vs null
- step 0 "objectPrototype" assertion 9: ["String prototype endsWith",true] vs null

### newman/request-name-in-script.postman_collection.json

- step 0 "r1" assertion 0: ["correct request name and description",true] vs ["correct request name and description",false]

### newman/sandbox-libraries.postman_collection.json

- step 0 "AJV" assertion 0: ["ajv.validate",true] vs null
- step 0 "AJV" assertion 1: ["ajv.compile",true] vs null
- step 1 "chai-postman" assertion 0: ["0: valid schema",true] vs ["0: valid schema",false]
- step 1 "chai-postman" assertion 1: ["1: negated assertions",true] vs ["1: negated assertions",false]
- step 1 "chai-postman" assertion 2: ["2: incorrect assertions",true] vs ["2: incorrect assertions",false]
- step 1 "chai-postman" assertion 3: ["3: incorrect negated assertions",true] vs ["3: incorrect negated assertions",false]
- step 1 "chai-postman" assertion 4: ["4: pm.response.to",true] vs ["4: pm.response.to",false]
- step 1 "chai-postman" assertion 5: ["5: pm.response.to.not",true] vs ["5: pm.response.to.not",false]
- step 2 "pm api" assertion 0: ["pre-assert request",true] vs ["pre-assert request",false]
- step 2 "pm api" assertion 1: ["pre-assert response",true] vs ["pre-assert response",false]

### newman/super-sandbox-test.postman_collection.json

- step 0 "r1" assertion 6: ["tv4 present",true] vs null
- step 0 "r1" assertion 7: ["CryptoJS md5",true] vs null
- step 1 "r2" assertion 1: ["Correct GUID: c7491f2a-0f43-4b76-a336-3e3cfcc28e8e",true] vs ["Correct GUID: 85b43151-72f1-4d35-a733-f145762ce727",true]
- step 1 "r2" assertion 2: ["Correct Random: 77",true] vs ["Correct Random: 94",true]

### newman/tc4/tc4.postman_collection.json

- step 0 "POST file test": status 200 vs undefined
- step 0 "POST file test" assertion 0: ["File contents are valid",false] vs null

### newman/v2-regression-tests/v2-regression-tests.postman_collection.json

- step 1 "Insecurity checks" assertion 0: ["Status code is 200",false] vs null

### newman/whatwg-url.postman_collection.json

- step 2 "newlines" assertion 1: ["Request URL",true] vs ["Request URL",false]
- step 7 "multiple : and @ in auth" assertion 1: ["Request URL",true] vs ["Request URL",false]
- step 8 "retain ? in empty query param" assertion 1: ["Request URL",true] vs ["Request URL",false]
- step 13 "params with & and #" assertion 1: ["Request URL",true] vs ["Request URL",false]

