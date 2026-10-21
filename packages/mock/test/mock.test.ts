import { describe, expect, it } from "vitest";
import type { Collection } from "@postbench/core";
import { startMockServer } from "../src/index.js";

const c: Collection = {
  info: { name: "M", schema: "s" },
  item: [{
    name: "user",
    request: { method: "GET", url: "{{base}}/users/:id" },
    response: [
      { name: "ok", code: 200, status: "OK", header: [{ key: "Content-Type", value: "application/json" }], body: '{"id":1}', originalRequest: { method: "GET", url: "{{base}}/users/:id" } },
      { name: "missing", code: 404, status: "Not Found", header: [], body: "nope", originalRequest: { method: "GET", url: "{{base}}/users/:id" } },
    ],
  }, {
    name: "me",
    request: { method: "GET", url: "{{base}}/users/me" },
    response: [{ name: "me", code: 200, body: "me", originalRequest: { method: "GET", url: "{{base}}/users/me" } }],
  }],
};

describe("mock server", () => {
  it("matches examples by path, name and code", async () => {
    const m = await startMockServer(c);
    const get = (p: string, h: Record<string, string> = {}) => fetch(m.url + p, { headers: h });
    expect(await (await get("/users/42")).json()).toEqual({ id: 1 });
    expect(await (await get("/users/me")).text()).toBe("me");
    expect((await get("/users/1", { "x-mock-response-code": "404" })).status).toBe(404);
    expect(await (await get("/users/1", { "x-mock-response-name": "missing" })).text()).toBe("nope");
    expect((await get("/nothing")).status).toBe(404);
    await m.close();
  });

  it("matches GraphQL examples by operation name and answers CORS preflight", async () => {
    const gql = (query: string, operationName?: string) => ({ method: "POST", url: "{{base}}/graphql", body: { mode: "graphql" as const, graphql: { query, ...(operationName ? { operationName } : {}) } } });
    const g: Collection = {
      info: { name: "G", schema: "s" },
      item: [{
        name: "graphql",
        request: gql("query Me { me { id } }"),
        response: [
          { name: "me", code: 200, body: '{"data":{"me":{"id":"1"}}}', originalRequest: gql("query Me { me { id } }") },
          { name: "posts", code: 200, body: '{"data":{"posts":[]}}', originalRequest: gql("query Posts { posts { id } }") },
        ],
      }],
    };
    const m = await startMockServer(g);
    const post = (body: unknown) => fetch(m.url + "/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect(await (await post({ query: "query Posts { posts { id } }" })).json()).toEqual({ data: { posts: [] } });
    expect(await (await post({ query: "{ me { id } }", operationName: "Me" })).json()).toEqual({ data: { me: { id: "1" } } });
    const pre = await fetch(m.url + "/graphql", { method: "OPTIONS" });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("*");
    await m.close();
  });
});
