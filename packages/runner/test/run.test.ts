import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Collection } from "@postbench/core";
import { startEchoServer, type EchoServer } from "@postbench/echo";
import { jsonReport, junitReport, parseCsv, parseDataFile, runCollection } from "../src/index.js";

let echo: EchoServer;
beforeAll(async () => {
  echo = await startEchoServer();
});
afterAll(() => echo.close());

const coll = (item: Collection["item"], extra: Partial<Collection> = {}): Collection => ({
  info: { name: "T", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
  item,
  ...extra,
});
const t = (listen: string, ...lines: string[]) => ({ listen, script: { exec: lines } });

describe("runner", () => {
  it("runs scripts in collection > folder > item order and chains variables", async () => {
    const c = coll(
      [
        {
          name: "F",
          event: [t("prerequest", "pm.variables.set('order', (pm.variables.get('order')||'') + 'F')")],
          item: [
            {
              name: "first",
              event: [t("prerequest", "pm.variables.set('order', (pm.variables.get('order')||'') + 'I')"), t("test", "pm.test('order', () => pm.expect(pm.variables.get('order')).to.equal('CFI'))", "pm.collectionVariables.set('token', pm.response.json().args.v)")],
              request: { method: "GET", url: "{{base}}/get?v=abc" },
            },
            {
              name: "second",
              event: [t("test", "pm.test('chained', () => pm.expect(pm.response.json().headers['x-token']).to.equal('abc'))")],
              request: { method: "GET", url: "{{base}}/get", header: [{ key: "X-Token", value: "{{token}}" }] },
            },
          ],
        },
      ],
      { event: [t("prerequest", "pm.variables.set('order', 'C')")], variable: [{ key: "base", value: echo.url }] },
    );
    const s = await runCollection(c);
    expect(s.failures).toEqual([]);
    expect(s.stats.assertions).toEqual({ total: 2, failed: 0 });
    expect(s.stats.requests.total).toBe(2);
    expect(s.collectionVariables.get("token")).toBe("abc");
  });

  it("iterations with data rows, failures and reports", async () => {
    const c = coll([{ name: "r", event: [t("test", "pm.test('even', () => pm.expect(Number(pm.iterationData.get('n')) % 2).to.equal(0))")], request: { url: "{{base}}/get?n={{n}}" } }]);
    const s = await runCollection(c, { envVar: { base: echo.url }, iterationData: [{ n: "2" }, { n: "3" }, { n: "4" }] });
    expect(s.stats.iterations).toEqual({ total: 3, failed: 1 });
    expect(s.stats.assertions).toEqual({ total: 3, failed: 1 });
    expect(s.failures[0]!.cursor.iteration).toBe(1);
    const xml = junitReport(s);
    expect(xml).toContain('<testsuites name="T" tests="3"');
    expect(xml.match(/<failure /g)).toHaveLength(1);
    const j = jsonReport(s, c) as { run: { stats: unknown; executions: unknown[] } };
    expect(j.run.executions).toHaveLength(3);
  });

  it("setNextRequest jumps and null stops", async () => {
    const c = coll([
      { name: "a", event: [t("test", "pm.execution.setNextRequest('c')")], request: { url: "{{base}}/get" } },
      { name: "b", request: { url: "{{base}}/get" } },
      { name: "c", event: [t("test", "postman.setNextRequest(null)")], request: { url: "{{base}}/get" } },
      { name: "d", request: { url: "{{base}}/get" } },
    ]);
    const s = await runCollection(c, { envVar: { base: echo.url } });
    expect(s.executions.map((e) => e.item.name)).toEqual(["a", "c"]);
  });

  it("--folder, bail and request errors", async () => {
    const c = coll([
      { name: "F1", item: [{ name: "x", request: { url: "{{base}}/get" } }] },
      { name: "F2", item: [{ name: "bad", request: { url: "http://127.0.0.1:1/" } }, { name: "after", request: { url: "{{base}}/get" } }] },
    ]);
    const s = await runCollection(c, { envVar: { base: echo.url }, folder: ["F2"], bail: true });
    expect(s.executions.map((e) => e.item.name)).toEqual(["bad"]);
    expect(s.stats.requests.failed).toBe(1);
    expect(s.error?.message).toMatch(/bailed/);
  });

  it("skipRequest and script errors", async () => {
    const c = coll([
      { name: "skip", event: [t("prerequest", "pm.execution.skipRequest()")], request: { url: "{{base}}/get" } },
      { name: "err", event: [t("test", "pm.test('ok', () => {}); boom();")], request: { url: "{{base}}/get" } },
    ]);
    const s = await runCollection(c, { envVar: { base: echo.url } });
    expect(s.executions[0]!.skipped).toBe(true);
    expect(s.stats.requests.total).toBe(1);
    expect(s.stats.testScripts.failed).toBe(1);
    expect(s.executions[1]!.assertions).toHaveLength(1);
  });

  it("pre-request edits and pm.sendRequest", async () => {
    const c = coll([
      {
        name: "edit",
        event: [
          t("prerequest", "pm.request.headers.add({key: 'X-Added', value: '1'})", "const r = await pm.sendRequest(pm.environment.get('base') + '/get?from=send'); pm.environment.set('sent', r.json().args.from)"),
          t("test", "pm.test('header added', () => pm.expect(pm.response.json().headers['x-added']).to.equal('1'))", "pm.test('sent', () => pm.expect(pm.environment.get('sent')).to.equal('send'))"),
        ],
        request: { url: "{{base}}/get" },
      },
    ]);
    const s = await runCollection(c, { envVar: { base: echo.url } });
    expect(s.failures).toEqual([]);
    expect(s.stats.assertions.total).toBe(2);
  });
});

describe("data files", () => {
  it("parses CSV with quotes, BOM and CRLF", () => {
    expect(parseCsv('a,b\r\n1,"x, ""y"""\r\n"2",\n')).toEqual([{ a: 1, b: 'x, "y"' }, { a: "2", b: "" }]);
    expect(parseDataFile("\ufeffk\nv")).toEqual([{ k: "v" }]);
    expect(parseDataFile('[{"k":1}]', "d.json")).toEqual([{ k: 1 }]);
  });
});
