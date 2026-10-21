import { describe, expect, it } from "vitest";
import { VariableScope } from "@postbench/core";
import { runScript, type ScriptContext } from "../src/index.js";

const ctx = (over: Partial<ScriptContext> = {}): ScriptContext => ({
  eventName: "prerequest",
  scopes: {
    local: new VariableScope("local"),
    data: new VariableScope("data"),
    environment: new VariableScope("environment"),
    collection: new VariableScope("collection"),
    globals: new VariableScope("globals"),
  },
  request: { method: "GET", url: "http://h/a?x=1", headers: [{ key: "A", value: "1" }] },
  ...over,
});

describe("sandbox", () => {
  it("pre-request scripts can mutate the request", async () => {
    const r = await runScript(`
      pm.request.headers.upsert({ key: "A", value: "2" });
      pm.request.headers.add({ key: "B", value: "3" });
      pm.request.url.query.add({ key: "y", value: "2" });
      pm.request.method = "post";
    `, ctx());
    expect(r.request.headers).toEqual([{ key: "A", value: "2" }, { key: "B", value: "3" }]);
    expect(r.request.url).toBe("http://h/a?x=1&y=2");
    expect(r.request.method).toBe("POST");
  });
  it("replacing the url with a string", async () => {
    const r = await runScript(`pm.request.url = "https://other/x";`, ctx());
    expect(r.request.url).toBe("https://other/x");
  });
  it("pm.sendRequest with callback and promise", async () => {
    const c = ctx({
      sendRequest: async (req) => ({ code: 201, status: "Created", headers: [], body: JSON.stringify({ got: typeof req === "string" ? req : req.url }), responseTime: 1 }),
    });
    const r = await runScript(`
      pm.sendRequest("http://a/1", (err, res) => { pm.environment.set("cb", res.json().got); });
      const res = await pm.sendRequest({ url: "http://a/2", method: "POST", header: { X: "1" } });
      pm.environment.set("promise", res.code);
    `, c);
    expect(r.error).toBeUndefined();
    expect(c.scopes.environment.toObject()).toEqual({ cb: "http://a/1", promise: 201 });
  });
  it("captures syntax errors", async () => {
    const r = await runScript(`pm.test("x", () => {`, ctx());
    expect(r.error?.name).toBe("SyntaxError");
  });
  it("times out on never-settling work", async () => {
    const r = await runScript(`pm.test("hang", function (done) {});`, ctx(), { timeout: 100 });
    expect(r.error?.message).toMatch(/timed out/);
  });
  it("skipRequest, visualizer and console", async () => {
    const r = await runScript(`pm.execution.skipRequest(); pm.visualizer.set("<b>{{x}}</b>", { x: 1 }); console.log("hi", 1);`, ctx());
    expect(r.skipRequest).toBe(true);
    expect(r.visualizer).toEqual({ template: "<b>{{x}}</b>", data: { x: 1 } });
    expect(r.console).toEqual([{ level: "log", messages: ["hi", 1] }]);
  });
  it("isolates globals between runs", async () => {
    await runScript(`globalThis.leak = 1;`, ctx());
    const r = await runScript(`pm.test("no leak", () => pm.expect(typeof leak).to.equal("undefined"));`, ctx());
    expect(r.assertions[0]!.passed).toBe(true);
  });
  it("info and setNextRequest(null)", async () => {
    const r = await runScript(`pm.environment.set("n", pm.info.requestName + ":" + pm.info.eventName); pm.execution.setNextRequest(null);`, ctx({ requestName: "R1" }));
    expect(r.nextRequest).toBeNull();
  });
});
