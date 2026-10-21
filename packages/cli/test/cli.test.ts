import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startEchoServer, type EchoServer } from "@postbench/echo";
import { runCommand } from "../src/index.js";

let echo: EchoServer;
let dir: string;
beforeAll(async () => {
  echo = await startEchoServer();
  dir = mkdtempSync(join(tmpdir(), "pb-cli-"));
  writeFileSync(join(dir, "c.json"), JSON.stringify({
    info: { name: "CLI", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    variable: [{ key: "hits", value: "0" }],
    item: [{
      name: "echo",
      event: [{ listen: "test", script: { exec: [
        "pm.test('status', () => pm.response.to.have.status(200));",
        "pm.test('row', () => pm.expect(pm.response.json().args.q).to.equal(pm.iterationData.get('q')));",
        "pm.environment.set('last', pm.iterationData.get('q'));",
        "pm.collectionVariables.set('hits', String(Number(pm.collectionVariables.get('hits')) + 1));",
      ] } }],
      request: { method: "GET", url: "{{base}}/get?q={{q}}" },
    }],
  }, null, "\t"));
  writeFileSync(join(dir, "env.json"), JSON.stringify({ name: "E", values: [{ key: "base", value: echo.url, enabled: true }] }));
  writeFileSync(join(dir, "data.csv"), "q\nalpha\nbeta\n");
});
afterAll(() => echo.close());

describe("postbench run", () => {
  it("runs with env, data, reporters and exports", async () => {
    let out = "";
    const { code, summary } = await runCommand(join(dir, "c.json"), {
      environment: join(dir, "env.json"),
      iterationData: join(dir, "data.csv"),
      reporters: "cli,json,junit",
      reporterJsonExport: join(dir, "r.json"),
      reporterJunitExport: join(dir, "r.xml"),
      exportEnvironment: join(dir, "env.out.json"),
      exportCollection: join(dir, "c.out.json"),
      color: "off",
    }, (s) => (out += s));
    expect(code).toBe(0);
    expect(summary.stats.assertions).toEqual({ total: 4, failed: 0 });
    expect(out).toContain("\u2713  status");
    expect(out).toMatch(/assertions\s+\u2502\s+4 \u2502\s+0 \u2502/);
    expect(JSON.parse(readFileSync(join(dir, "r.json"), "utf8")).run.stats.iterations.total).toBe(2);
    expect(readFileSync(join(dir, "r.xml"), "utf8")).toContain("<testsuites");
    const env = JSON.parse(readFileSync(join(dir, "env.out.json"), "utf8"));
    expect(env.values.find((v: { key: string }) => v.key === "last").value).toBe("beta");
    const c = JSON.parse(readFileSync(join(dir, "c.out.json"), "utf8"));
    expect(c.variable[0].value).toBe("2");
  });
  it("exits 1 on failures unless suppressed", async () => {
    const f = { envVar: [`base=${echo.url}`], iterationCount: "1", reporters: "" };
    const a = await runCommand(join(dir, "c.json"), f);
    expect(a.code).toBe(1);
    const b = await runCommand(join(dir, "c.json"), { ...f, suppressExitCode: true });
    expect(b.code).toBe(0);
  });
});
