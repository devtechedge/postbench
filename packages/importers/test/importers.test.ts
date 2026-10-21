import { describe, expect, it } from "vitest";
import { validateCollection } from "@postbench/core";
import { importAny, importCurl, importHar, importOpenApi, tokenize } from "../src/index.js";

describe("curl", () => {
  it("tokenizes quotes and continuations", () => {
    expect(tokenize(`curl -H 'A: it'\\''s' "x\\"y" \\\n z`)).toEqual(["curl", "-H", "A: it's", 'x"y', "z"]);
  });
  it("imports method, headers, json body and basic auth", () => {
    const i = importCurl(`curl -X PUT https://api.x.io/u/1 -H 'Content-Type: application/json' -d '{"a":1}' -u bob:pw`);
    expect(i.request).toMatchObject({ method: "PUT", url: "https://api.x.io/u/1", body: { mode: "raw", raw: '{"a":1}', options: { raw: { language: "json" } } }, auth: { type: "basic" } });
  });
  it("defaults to POST with data, urlencoded and forms", () => {
    expect(importCurl("curl https://x -d a=1 -d b=2").request).toMatchObject({ method: "POST", body: { mode: "urlencoded", urlencoded: [{ key: "a", value: "1" }, { key: "b", value: "2" }] } });
    expect(importCurl(`curl https://x -F 'f=@"/p/a.png"' -F t=v`).request).toMatchObject({ body: { mode: "formdata", formdata: [{ key: "f", src: "/p/a.png", type: "file" }, { key: "t", value: "v", type: "text" }] } });
    expect(importCurl("curl -G https://x -d q=1").request).toMatchObject({ method: "GET", url: "https://x?q=1" });
  });
});

describe("HAR", () => {
  it("keeps responses as examples", () => {
    const c = importHar({ log: { entries: [{ request: { method: "POST", url: "https://h/a?x=1", headers: [{ name: "Content-Length", value: "2" }, { name: "X", value: "1" }], postData: { mimeType: "application/json", text: "{}" } }, response: { status: 201, statusText: "Created", headers: [], content: { text: "ok" } } }] } });
    expect(c.item[0]).toMatchObject({ name: "POST /a", request: { header: [{ key: "X", value: "1" }] }, response: [{ code: 201, body: "ok" }] });
    expect(validateCollection(c).errors).toEqual([]);
  });
});

describe("OpenAPI", () => {
  const yaml = `
openapi: 3.0.3
info: { title: Pets }
servers: [{ url: "https://pets.example/v1" }]
paths:
  /pets/{petId}:
    parameters: [{ name: petId, in: path, required: true, schema: { type: string } }]
    get:
      tags: [pets]
      summary: Get pet
      parameters: [{ name: verbose, in: query, schema: { type: boolean } }]
      responses:
        "200": { description: OK, content: { application/json: { schema: { $ref: "#/components/schemas/Pet" } } } }
  /pets:
    post:
      tags: [pets]
      summary: Create pet
      requestBody: { content: { application/json: { schema: { $ref: "#/components/schemas/Pet" } } } }
      responses: { "201": { description: Created } }
components:
  schemas:
    Pet: { type: object, properties: { id: { type: integer }, name: { type: string, example: Rex } } }
`;
  it("groups by tag with baseUrl, path vars and sampled bodies", () => {
    const c = importOpenApi(yaml);
    expect(c.variable).toEqual([{ key: "baseUrl", value: "https://pets.example/v1" }]);
    const f = c.item[0] as { name: string; item: any[] };
    expect(f.name).toBe("pets");
    expect(f.item[0].request.url).toMatchObject({ path: ["pets", ":petId"], variable: [{ key: "petId" }], query: [{ key: "verbose", disabled: true }] });
    expect(JSON.parse(f.item[0].response[0].body)).toEqual({ id: 0, name: "Rex" });
    expect(JSON.parse(f.item[1].request.body.raw)).toEqual({ id: 0, name: "Rex" });
    expect(validateCollection(c).errors).toEqual([]);
  });
  it("importAny detects formats", () => {
    expect(importAny(yaml).kind).toBe("openapi");
    expect(importAny("curl https://x").kind).toBe("curl");
    expect(importAny('{"log":{"entries":[]}}').kind).toBe("har");
  });
});
