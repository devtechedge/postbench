import type { Collection, EnvironmentFile } from "@postbench/core";
import { SCHEMA_V21 } from "@postbench/core";

/** Demo collection against public CORS-enabled APIs. */
export const sampleCollection: Collection = {
  info: { name: "Postbench demo", schema: SCHEMA_V21, description: "Requests against httpbin.org and JSONPlaceholder with tests." },
  variable: [{ key: "httpbin", value: "https://httpbin.org" }, { key: "jsonph", value: "https://jsonplaceholder.typicode.com" }],
  item: [
    {
      name: "JSONPlaceholder",
      item: [
        {
          name: "List posts",
          event: [{ listen: "test", script: { exec: [
            "pm.test('status is 200', () => pm.response.to.have.status(200));",
            "const posts = pm.response.json();",
            "pm.test('returns 10 posts', () => pm.expect(posts).to.have.lengthOf(10));",
            "pm.collectionVariables.set('postId', posts[0].id);",
          ] } }],
          request: { method: "GET", url: "{{jsonph}}/posts?userId=1" },
        },
        {
          name: "Get post by id",
          event: [{ listen: "test", script: { exec: [
            "pm.test('id matches the chained variable', () => pm.expect(pm.response.json().id).to.eql(Number(pm.collectionVariables.get('postId'))));",
            "pm.test('responds fast', () => pm.expect(pm.response.responseTime).to.be.below(5000));",
          ] } }],
          request: { method: "GET", url: "{{jsonph}}/posts/:id", },
        },
        {
          name: "Create post",
          event: [
            { listen: "prerequest", script: { exec: ["pm.variables.set('title', 'hello from ' + pm.info.requestName);"] } },
            { listen: "test", script: { exec: ["pm.test('created', () => pm.response.to.have.status(201));", "pm.test('echoes title', () => pm.expect(pm.response.json().title).to.include('hello'));"] } },
          ],
          request: { method: "POST", header: [{ key: "Content-Type", value: "application/json" }], url: "{{jsonph}}/posts", body: { mode: "raw", raw: "{\n  \"title\": \"{{title}}\",\n  \"body\": \"{{$randomLoremSentence}}\",\n  \"userId\": 1\n}", options: { raw: { language: "json" } } } },
        },
      ],
    },
    {
      name: "httpbin",
      item: [
        {
          name: "Basic auth",
          event: [{ listen: "test", script: { exec: ["pm.test('authenticated', () => pm.expect(pm.response.json().authenticated).to.be.true);"] } }],
          request: { method: "GET", url: "{{httpbin}}/basic-auth/user/{{password}}", auth: { type: "basic", basic: [{ key: "username", value: "user" }, { key: "password", value: "{{password}}" }] } },
        },
        {
          name: "Form post",
          event: [{ listen: "test", script: { exec: ["pm.test('form echoed', () => pm.expect(pm.response.json().form).to.eql({ a: '1', b: 'two' }));"] } }],
          request: { method: "POST", url: "{{httpbin}}/post", body: { mode: "urlencoded", urlencoded: [{ key: "a", value: "1" }, { key: "b", value: "two" }] } },
        },
        {
          name: "Headers and query",
          event: [{ listen: "test", script: { exec: ["const j = pm.response.json();", "pm.test('guid header sent', () => pm.expect(j.headers['X-Demo']).to.match(/^[0-9a-f-]{36}$/));", "pm.test('query sent', () => pm.expect(j.args.q).to.equal('postbench'));"] } }],
          request: { method: "GET", header: [{ key: "X-Demo", value: "{{$guid}}" }], url: "{{httpbin}}/get?q=postbench" },
        },
      ],
    },
  ],
};
// Path variable for "Get post by id".
(((sampleCollection.item[0] as { item: { request: { url: unknown } }[] }).item[1]!.request).url = {
  raw: "{{jsonph}}/posts/:id", host: ["{{jsonph}}"], path: ["posts", ":id"], variable: [{ key: "id", value: "{{postId}}" }],
});

export const sampleEnvironment: EnvironmentFile = {
  name: "Demo",
  values: [{ key: "password", value: "passwd", type: "secret", enabled: true }],
  _postman_variable_scope: "environment",
};
