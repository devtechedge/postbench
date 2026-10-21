import { describe, expect, it } from "vitest";
import { VariableScope } from "@postbench/core";
import { runScript } from "../src/index.js";
import { oracle, type OracleInput } from "./oracle.js";

async function ours(input: OracleInput) {
  const scopes = {
    local: new VariableScope("local"),
    data: VariableScope.fromObject(input.data ?? {}, "data"),
    environment: VariableScope.fromObject(input.env ?? {}, "environment"),
    collection: VariableScope.fromObject(input.collection ?? {}, "collection"),
    globals: VariableScope.fromObject(input.globals ?? {}, "globals"),
  };
  const r = await runScript(input.script, {
    eventName: input.eventName,
    scopes,
    request: { method: input.request.method, url: input.request.url, headers: input.request.headers ?? [], body: input.request.body },
    response: input.response,
  });
  return {
    assertions: r.assertions.map((a) => ({ name: a.name, passed: a.passed, skipped: a.skipped })),
    env: scopes.environment.toObject(),
    globals: scopes.globals.toObject(),
    collection: scopes.collection.toObject(),
    nextRequest: r.nextRequest,
    error: r.error?.message,
  };
}

const json = (o: unknown) => ({ code: 200, status: "OK", headers: [{ key: "Content-Type", value: "application/json" }, { key: "X-Trace", value: "abc" }], body: JSON.stringify(o), responseTime: 42 });
const req = { method: "GET", url: "https://api.example.com/v1/users?page=2&limit=10", headers: [{ key: "Accept", value: "application/json" }] };

const cases: [string, OracleInput][] = [
  ["status and json assertions", { eventName: "test", request: req, response: json({ id: 7, tags: ["a", "b"] }), script: `
    pm.test("status 200", () => pm.response.to.have.status(200));
    pm.test("status 201 fails", () => pm.response.to.have.status(201));
    pm.test("is ok", () => pm.response.to.be.ok);
    pm.test("json id", () => pm.expect(pm.response.json().id).to.eql(7));
    pm.test("tags", () => pm.expect(pm.response.json().tags).to.include("b").and.have.lengthOf(2));
    pm.test("header", () => pm.response.to.have.header("X-Trace"));
    pm.test("header value mismatch", () => pm.response.to.have.header("X-Trace", "nope"));
    pm.test("time", () => pm.expect(pm.response.responseTime).to.be.below(100));
  ` }],
  ["variable scopes", { eventName: "test", env: { e: "1" }, globals: { g: "1", shared: "glob" }, collection: { c: "1", shared: "coll" }, data: { d: "data" }, request: req, response: json({}), script: `
    pm.environment.set("fromTest", "yes");
    pm.globals.set("g", 2);
    pm.collectionVariables.set("c", "changed");
    pm.environment.unset("e");
    pm.test("resolve", () => pm.expect(pm.variables.get("shared")).to.equal("coll"));
    pm.test("data", () => pm.expect(pm.iterationData.get("d")).to.equal("data"));
    pm.variables.set("shared", "local");
    pm.test("local wins", () => pm.expect(pm.variables.get("shared")).to.equal("local"));
    pm.test("replaceIn", () => pm.expect(pm.variables.replaceIn("{{shared}}-{{d}}")).to.equal("local-data"));
  ` }],
  ["legacy tests object and postman.*", { eventName: "test", request: req, response: json({ ok: true }), script: `
    tests["legacy pass"] = responseCode.code === 200;
    tests["legacy fail"] = false;
    var body = JSON.parse(responseBody);
    tests["body ok"] = body.ok === true;
    postman.setEnvironmentVariable("legacy", "set");
    postman.setGlobalVariable("lg", "g");
    tests["header lookup"] = postman.getResponseHeader("x-trace") === "abc";
  ` }],
  ["skip and async done", { eventName: "test", request: req, response: json({}), script: `
    pm.test.skip("skipped one", () => { throw new Error("never"); });
    pm.test("async done", function (done) { setTimeout(() => { pm.expect(1).to.equal(1); done(); }, 10); });
    pm.test("async failing", function (done) { setTimeout(() => { try { pm.expect(1).to.equal(2); done(); } catch (e) { done(e); } }, 5); });
  ` }],
  ["request url helpers in prerequest", { eventName: "prerequest", request: req, script: `
    pm.test("host", () => pm.expect(pm.request.url.getHost()).to.equal("api.example.com"));
    pm.test("path", () => pm.expect(pm.request.url.getPath()).to.equal("/v1/users"));
    pm.test("query", () => pm.expect(pm.request.url.query.get("page")).to.equal("2"));
    pm.test("method", () => pm.expect(pm.request.method).to.equal("GET"));
    pm.test("headers", () => pm.expect(pm.request.headers.get("accept")).to.equal("application/json"));
    pm.environment.set("url", pm.request.url.toString());
  ` }],
  ["setNextRequest", { eventName: "test", request: req, response: json({}), script: `postman.setNextRequest("Second");` }],
  ["chai flavours", { eventName: "test", request: req, response: json({ a: { b: [1, 2, 3] }, s: "Hello" }), script: `
    const j = pm.response.json();
    pm.test("deep", () => pm.expect(j).to.have.nested.property("a.b[1]", 2));
    pm.test("oneOf", () => pm.expect(j.s).to.be.oneOf(["Hello", "Bye"]));
    pm.test("match", () => pm.expect(j.s).to.match(/^He/));
    pm.test("type", () => pm.expect(j.a.b).to.be.an("array").that.is.not.empty);
    pm.test("keys", () => pm.expect(j).to.have.all.keys("a", "s"));
    pm.test("fails", () => pm.expect(j.a.b).to.have.members([1, 2]));
    pm.test("body is json", () => pm.response.to.be.json);
    pm.test("body has", () => pm.expect(pm.response.text()).to.include("Hello"));
  ` }],
  ["runtime error after a passing test", { eventName: "test", request: req, response: json({}), script: `
    pm.test("before", () => {});
    undefinedFunction();
    pm.test("after", () => {});
  ` }],
  ["libraries", { eventName: "test", request: req, response: json({}), script: `
    const CryptoJS = require("crypto-js");
    const _ = require("lodash");
    pm.test("md5", () => pm.expect(CryptoJS.MD5("abc").toString()).to.equal("900150983cd24fb0d6963f7d28e17f72"));
    pm.test("lodash", () => pm.expect(_.chunk([1,2,3], 2)).to.eql([[1,2],[3]]));
    pm.test("btoa", () => pm.expect(btoa("hi")).to.equal("aGk="));
  ` }],
  ["response status families", { eventName: "test", request: req, response: { code: 404, status: "Not Found", headers: [], body: "", responseTime: 1 }, script: `
    pm.test("not found", () => pm.response.to.be.notFound);
    pm.test("client error", () => pm.response.to.be.clientError);
    pm.test("not ok", () => pm.response.to.not.be.ok);
    pm.test("is error", () => pm.response.to.be.error);
    pm.test("success fails", () => pm.response.to.be.success);
    pm.test("status text", () => pm.response.to.have.status("Not Found"));
  ` }],
];

describe("differential against postman-sandbox", () => {
  for (const [name, input] of cases) {
    it(name, async () => {
      const [a, b] = await Promise.all([ours(input), oracle(input)]);
      expect(a.assertions).toEqual(b.assertions);
      expect(a.env).toEqual(b.env);
      expect(a.globals).toEqual(b.globals);
      expect(a.collection).toEqual(b.collection);
      expect(a.nextRequest ?? null).toEqual(b.nextRequest ?? null);
      expect(!!a.error).toBe(!!b.error);
    }, 20000);
  }
});
