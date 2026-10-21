import { describe, expect, it } from "vitest";
import sdk from "postman-collection";
import { parseUrl, urlToString } from "../src/index.js";

const raws = [
  "https://postman-echo.com/get?foo=bar&x",
  "http://localhost:3000/users/:id/posts?limit=10#top",
  "{{baseUrl}}/api/v1/items",
  "https://user:pw@example.com:8443/a/b/",
  "example.com/path",
  "https://{{host}}:{{port}}/x?a={{v}}",
  "http://127.0.0.1/",
];

describe("URL parse/build matches postman-collection SDK", () => {
  for (const raw of raws) {
    it(raw, () => {
      const theirs = new sdk.Url(raw).toString();
      expect(urlToString(parseUrl(raw))).toBe(theirs);
    });
  }
  it("resolves path variables", () => {
    const u = parseUrl("http://x/users/:id");
    u.variable = [{ key: "id", value: "7" }];
    expect(urlToString(u, { resolvePathVariables: true })).toBe("http://x/users/7");
  });
  it("skips disabled query params", () => {
    expect(urlToString({ host: ["x"], protocol: "http", query: [{ key: "a", value: "1" }, { key: "b", value: "2", disabled: true }] })).toBe("http://x?a=1");
  });
});
