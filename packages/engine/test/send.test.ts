import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VariableResolver, VariableScope } from "@postbench/core";
import { startEchoServer, type EchoServer } from "@postbench/echo";
import { CookieJar, applyOAuth1, prepareRequest, send, type PreparedRequest } from "../src/index.js";

let echo: EchoServer;
beforeAll(async () => {
  echo = await startEchoServer();
});
afterAll(() => echo.close());

const resolver = (vars: Record<string, unknown> = {}) => new VariableResolver([VariableScope.fromObject({ base: echo.url, ...vars }, "environment")]);
const json = (r: { body: Uint8Array }) => JSON.parse(Buffer.from(r.body).toString("utf8"));
const go = (request: Parameters<typeof prepareRequest>[0], vars?: Record<string, unknown>, opts: Parameters<typeof send>[1] = {}) =>
  send(prepareRequest(request, { resolver: resolver(vars) }), opts);

describe("methods, params, headers", () => {
  it("GET with query and variable substitution", async () => {
    const r = await go({ method: "GET", url: "{{base}}/get?foo={{v}}&x=1", header: [{ key: "X-Test", value: "{{v}}" }, { key: "X-Off", value: "1", disabled: true }] }, { v: "bar" });
    expect(r.code).toBe(200);
    const b = json(r);
    expect(b.args).toEqual({ foo: "bar", x: "1" });
    expect(b.headers["x-test"]).toBe("bar");
    expect(b.headers["x-off"]).toBeUndefined();
    expect(b.headers["user-agent"]).toMatch(/^PostbenchRuntime\//);
  });
  it("custom methods are sent verbatim", async () => {
    const r = await go({ method: "purge", url: "{{base}}/anything" });
    expect(json(r).method).toBe("PURGE");
  });
  it("path variables", async () => {
    const r = await go({ method: "GET", url: { raw: "", protocol: "http", host: ["127.0.0.1"], port: String(echo.port), path: [":p"], variable: [{ key: "p", value: "get" }] } });
    expect(r.code).toBe(200);
  });
  it("HEAD has no body", async () => {
    const r = await go({ method: "HEAD", url: "{{base}}/get" });
    expect(r.code).toBe(200);
    expect(r.body.length).toBe(0);
  });
});

describe("bodies", () => {
  it("raw JSON sets content type", async () => {
    const r = await go({ method: "POST", url: "{{base}}/post", body: { mode: "raw", raw: '{"a":"{{v}}"}', options: { raw: { language: "json" } } } }, { v: 1 });
    const b = json(r);
    expect(b.json).toEqual({ a: "1" });
    expect(b.headers["content-type"]).toBe("application/json");
  });
  it("urlencoded", async () => {
    const r = await go({ method: "POST", url: "{{base}}/post", body: { mode: "urlencoded", urlencoded: [{ key: "a", value: "1 2" }, { key: "a", value: "&" }, { key: "off", value: "x", disabled: true }] } });
    expect(json(r).form).toEqual({ a: ["1 2", "&"] });
  });
  it("form-data with text and file parts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pb-"));
    writeFileSync(join(dir, "hello.txt"), "hello file");
    const r = await go(
      { method: "POST", url: "{{base}}/post", body: { mode: "formdata", formdata: [{ key: "t", value: "text", type: "text" }, { key: "f", src: "hello.txt", type: "file" }] } },
      {},
      { workingDir: dir },
    );
    const b = json(r);
    expect(b.form).toEqual({ t: "text" });
    expect(Buffer.from(String(b.files["hello.txt"]).split(",")[1], "base64").toString()).toBe("hello file");
  });
  it("binary file body", async () => {
    const r = await go({ method: "POST", url: "{{base}}/post", body: { mode: "file", file: { content: "raw-bytes" } } });
    expect(json(r).data).toBe("raw-bytes");
  });
  it("GraphQL becomes a JSON body", async () => {
    const r = await go({ method: "POST", url: "{{base}}/post", body: { mode: "graphql", graphql: { query: "query { me { id } }", variables: '{"n": 1}' } } });
    expect(json(r).json).toEqual({ query: "query { me { id } }", variables: { n: 1 } });
  });
  it("GET bodies are pruned unless disableBodyPruning", async () => {
    const req = { method: "GET", url: "{{base}}/anything", body: { mode: "raw" as const, raw: "x" } };
    const pruned = prepareRequest(req, { resolver: resolver() });
    expect(pruned.body.kind).toBe("none");
    const kept = prepareRequest(req, { resolver: resolver(), behavior: { disableBodyPruning: true } });
    expect(kept.body.kind).toBe("text");
  });
});

describe("auth", () => {
  it("basic", async () => {
    const r = await go({ url: "{{base}}/basic-auth", auth: { type: "basic", basic: [{ key: "username", value: "postman" }, { key: "password", value: "{{pw}}" }] } }, { pw: "password" });
    expect(r.code).toBe(200);
  });
  it("digest replays after the 401 challenge", async () => {
    const r = await go({ url: "{{base}}/digest-auth", auth: { type: "digest", digest: [{ key: "username", value: "postman" }, { key: "password", value: "password" }] } });
    expect(r.code).toBe(200);
    expect(json(r).authenticated).toBe(true);
  });
  it("bearer, api key (header and query), oauth2", async () => {
    const b = json(await go({ url: "{{base}}/get", auth: { type: "bearer", bearer: [{ key: "token", value: "t0k" }] } }));
    expect(b.headers.authorization).toBe("Bearer t0k");
    const k = json(await go({ url: "{{base}}/get", auth: { type: "apikey", apikey: [{ key: "key", value: "X-Key" }, { key: "value", value: "v" }] } }));
    expect(k.headers["x-key"]).toBe("v");
    const q = json(await go({ url: "{{base}}/get?a=1", auth: { type: "apikey", apikey: [{ key: "key", value: "k" }, { key: "value", value: "v" }, { key: "in", value: "query" }] } }));
    expect(q.args).toEqual({ a: "1", k: "v" });
    const o = json(await go({ url: "{{base}}/get", auth: { type: "oauth2", oauth2: [{ key: "accessToken", value: "abc" }, { key: "headerPrefix", value: "Token" }] } }));
    expect(o.headers.authorization).toBe("Token abc");
  });
  it("awsv4 signs with service and region", async () => {
    const b = json(await go({ url: "{{base}}/get", auth: { type: "awsv4", awsv4: [{ key: "accessKey", value: "AKID" }, { key: "secretKey", value: "s" }, { key: "region", value: "ap-south-1" }, { key: "service", value: "s3" }] } }));
    expect(b.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/ap-south-1\/s3\/aws4_request, SignedHeaders=.*host.*x-amz-date/);
    expect(b.headers["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);
  });
  it("oauth1 HMAC-SHA1 matches the RFC 5849 photos example", () => {
    const req: PreparedRequest = {
      method: "GET",
      url: "http://photos.example.net/photos?file=vacation.jpg&size=original",
      headers: [],
      body: { kind: "none" },
      auth: { type: "oauth1", oauth1: [
        { key: "consumerKey", value: "dpf43f3p2l4k3l03" }, { key: "consumerSecret", value: "kd94hf93k423kf44" },
        { key: "token", value: "nnch734d00sl2jdk" }, { key: "tokenSecret", value: "pfkkdhi9sl3r4s00" },
      ] },
    };
    applyOAuth1(req, [], { nonce: "kllo9940pd9333jh", timestamp: "1191242096" });
    expect(req.headers[0]!.value).toContain('oauth_signature="tR3%2BTy81lMeYAr%2FFid0kMTYa%2FWM%3D"');
  });
  it("auth inherits from folder then collection, noauth stops it", () => {
    const folderAuth = { type: "bearer" as const, bearer: [{ key: "token", value: "folder" }] };
    const p = prepareRequest({ url: "http://x/" }, { resolver: resolver(), parents: [{ item: [], auth: folderAuth }], collectionAuth: { type: "basic", basic: [] } });
    expect(p.auth?.type).toBe("bearer");
    const n = prepareRequest({ url: "http://x/", auth: { type: "noauth" } }, { resolver: resolver(), parents: [{ item: [], auth: folderAuth }] });
    expect(n.auth?.type).toBe("noauth");
  });
});

describe("cookies and redirects", () => {
  it("stores Set-Cookie through a redirect and sends it back", async () => {
    const jar = new CookieJar();
    const r = await go({ url: "{{base}}/cookies/set?a=1&b=two" }, {}, { cookieJar: jar });
    expect(json(r).cookies).toEqual({ a: "1", b: "two" });
    expect(r.redirects).toHaveLength(1);
    expect(r.cookies.map((c) => c.name).sort()).toEqual(["a", "b"]);
    const again = await go({ url: "{{base}}/cookies" }, {}, { cookieJar: jar });
    expect(json(again).cookies).toEqual({ a: "1", b: "two" });
  });
  it("302 turns POST into GET, 307 keeps it", async () => {
    const r1 = await go({ method: "POST", url: "{{base}}/redirect-to?url=/anything&status_code=302", body: { mode: "raw", raw: "x" } });
    expect(json(r1).method).toBe("GET");
    const r2 = await go({ method: "POST", url: "{{base}}/redirect-to?url=/anything&status_code=307", body: { mode: "raw", raw: "x" } });
    expect(json(r2).method).toBe("POST");
    expect(json(r2).data).toBe("x");
  });
  it("followRedirects false and maxRedirects", async () => {
    const r = await send(prepareRequest({ url: "{{base}}/redirect/3" }, { resolver: resolver() }), { behavior: { followRedirects: false } });
    expect(r.code).toBe(302);
    const capped = await send(prepareRequest({ url: "{{base}}/redirect/3" }, { resolver: resolver() }), { behavior: { maxRedirects: 2 } });
    expect(capped.code).toBe(302);
    expect(capped.redirects).toHaveLength(2);
    const ok = await send(prepareRequest({ url: "{{base}}/redirect/3" }, { resolver: resolver() }));
    expect(ok.code).toBe(200);
  });
});

describe("transport", () => {
  for (const enc of ["gzip", "deflate", "brotli"]) {
    it(`decodes ${enc}`, async () => {
      const r = await go({ url: `{{base}}/${enc}` });
      expect(json(r)[enc]).toBe(true);
    });
  }
  it("reports timings and sizes", async () => {
    const r = await go({ url: "{{base}}/delay/0.2" });
    expect(r.timings.total).toBeGreaterThanOrEqual(150);
    expect(r.timings.firstByte).toBeGreaterThan(100);
    expect(r.responseSize).toBeGreaterThan(0);
  });
  it("times out", async () => {
    await expect(go({ url: "{{base}}/delay/2" }, {}, { timeout: 100 })).rejects.toThrow(/ETIMEDOUT/);
  });
  it("routes plain HTTP through a proxy with auth", async () => {
    const seen: string[] = [];
    const proxy = http.createServer((req, res) => {
      seen.push(`${req.headers["proxy-authorization"]} ${req.url}`);
      const u = new URL(req.url!);
      const up = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: req.method, headers: req.headers }, (r) => {
        res.writeHead(r.statusCode!, r.headers);
        r.pipe(res);
      });
      req.pipe(up);
    });
    await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
    const port = (proxy.address() as net.AddressInfo).port;
    const r = await go({ url: "{{base}}/get" }, {}, { proxy: { url: `http://u:p@127.0.0.1:${port}` } });
    expect(r.code).toBe(200);
    expect(seen[0]).toBe(`Basic ${Buffer.from("u:p").toString("base64")} ${echo.url}/get`);
    proxy.close();
  });
  it("strictSSL false accepts a self-signed certificate", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pb-tls-"));
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-days", "1", "-subj", "/CN=localhost"], { stdio: "ignore" });
    const server = https.createServer({ key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) }, (_q, s) => s.end("secure"));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const url = `https://127.0.0.1:${(server.address() as net.AddressInfo).port}/`;
    await expect(send(prepareRequest({ url }, { resolver: resolver() }))).rejects.toThrow();
    const r = await send(prepareRequest({ url }, { resolver: resolver() }), { behavior: { strictSSL: false } });
    expect(Buffer.from(r.body).toString()).toBe("secure");
    expect(r.timings.secureHandshake).toBeGreaterThanOrEqual(0);
    server.close();
  });
});
