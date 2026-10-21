import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startEchoServer } from "@postbench/echo";
import { runCase } from "../src/conformance.js";

const root = fileURLToPath(new URL("../collections", import.meta.url));
const cases = [
  "newman/case-insen-header-sandbox.postman_collection.json",
  "newman/clear-vars-sandbox.postman_collection.json",
  "newman/disabled-and-duplicate-variables/disabled-and-duplicates.postman_collection.json",
  "newman/request-name-in-script.postman_collection.json",
  "newman/set-next-request.postman_collection.json",
  "newman/var-replacement.postman_collection.json",
];

describe("newman conformance", () => {
  let echo: Awaited<ReturnType<typeof startEchoServer>>;
  const work = mkdtempSync(join(tmpdir(), "pb-conf-test-"));
  beforeAll(async () => {
    echo = await startEchoServer();
  });
  afterAll(async () => {
    await echo.close();
  });
  for (const c of cases) {
    it(`matches newman on ${c}`, async () => {
      const r = await runCase(join(root, c), root, echo.url, work);
      expect(r.diff ?? []).toEqual([]);
      expect(r.status).toBe("match");
    }, 60000);
  }
});
