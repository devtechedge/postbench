import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VariableResolver } from "@postbench/core";
import { prepareRequest } from "@postbench/engine";
import { startEchoServer, type EchoServer } from "@postbench/echo";
import { curl, fetchSnippet, generate, httpie, languages, pythonRequests } from "../src/index.js";

let echo: EchoServer;
beforeAll(async () => {
  echo = await startEchoServer();
});
afterAll(() => echo.close());
const r = new VariableResolver([]);

describe("codegen", () => {
  const json = () => prepareRequest({ method: "POST", url: `${echo.url}/post?x=1`, header: [{ key: "X-A", value: "it's" }], body: { mode: "raw", raw: '{"a":1}', options: { raw: { language: "json" } } }, auth: { type: "bearer", bearer: [{ key: "token", value: "T" }] } }, { resolver: r });

  it("curl snippet runs and the echo server sees the same request", async () => {
    const snippet = curl(json());
    expect(snippet).toContain("--header 'Authorization: Bearer T'");
    expect(snippet).toContain(`--header 'X-A: it'\\''s'`);
    const out = JSON.parse((await run("bash", ["-c", snippet])).stdout);
    expect(out.json).toEqual({ a: 1 });
    expect(out.headers["x-a"]).toBe("it's");
    expect(out.headers.authorization).toBe("Bearer T");
    expect(out.args).toEqual({ x: "1" });
  });

  it("fetch snippet runs under Node", async () => {
    const code = fetchSnippet(json());
    const fn = new Function("console", `return (async () => {${code}})()`);
    let printed = "";
    await fn({ log: (s: string) => (printed = s) });
    expect(JSON.parse(printed).json).toEqual({ a: 1 });
  });

  it("urlencoded and form-data", () => {
    const u = prepareRequest({ method: "POST", url: "http://h/", body: { mode: "urlencoded", urlencoded: [{ key: "a", value: "1 2" }] } }, { resolver: r });
    expect(curl(u)).toContain("--data-urlencode 'a=1 2'");
    expect(pythonRequests(u)).toContain('payload = "a=1+2"');
    const f = prepareRequest({ method: "POST", url: "http://h/", body: { mode: "formdata", formdata: [{ key: "t", value: "v" }, { key: "f", src: "/tmp/x.png", type: "file" }] } }, { resolver: r });
    expect(curl(f)).toContain(`--form 'f=@"/tmp/x.png"'`);
    expect(httpie(f)).toContain("--multipart");
    expect(pythonRequests(f)).toContain('files = [("f", open("/tmp/x.png", "rb"))]');
  });

  it("every language produces output", () => {
    for (const l of languages) expect(generate(l.id, json()).length).toBeGreaterThan(20);
  });
});
