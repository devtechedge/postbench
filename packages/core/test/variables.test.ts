import { describe, expect, it } from "vitest";
import sdk from "postman-collection";
import { VariableResolver, VariableScope, dynamicVariableNames, referencedVariables } from "../src/index.js";

const scopes = () => [
  new VariableScope("local", [{ key: "a", value: "local" }]),
  new VariableScope("data", [{ key: "a", value: "data" }, { key: "b", value: "data" }]),
  new VariableScope("environment", [{ key: "b", value: "env" }, { key: "c", value: "env" }]),
  new VariableScope("collection", [{ key: "c", value: "coll" }, { key: "d", value: "coll" }]),
  new VariableScope("globals", [{ key: "d", value: "glob" }, { key: "e", value: "glob" }]),
];

describe("precedence", () => {
  it("narrowest scope wins: local > data > environment > collection > globals", () => {
    const r = new VariableResolver(scopes());
    expect(r.replaceIn("{{a}} {{b}} {{c}} {{d}} {{e}} {{f}}")).toBe("local data env coll glob {{f}}");
  });
  it("disabled variables are skipped and last duplicate wins", () => {
    const s = new VariableScope("environment", [
      { key: "x", value: "1" },
      { key: "x", value: "2" },
      { key: "x", value: "3", disabled: true },
    ]);
    expect(s.get("x")).toBe("2");
  });
  it("set updates the active entry", () => {
    const s = new VariableScope("environment", [{ key: "x", value: "1" }]);
    s.set("x", 5);
    s.set("y", true);
    expect(s.toObject()).toEqual({ x: 5, y: true });
    s.unset("x");
    expect(s.has("x")).toBe(false);
  });
});

describe("substitution matches postman-collection SDK", () => {
  const cases: [string, Record<string, unknown>][] = [
    ["{{a}}", { a: "1" }],
    ["{{a}}{{b}}", { a: "{{b}}", b: "x" }],
    ["{{ {{a}}", { a: "1" }],
    ["{{a}}", { a: "{{a}}" }],
    ["{{x{{y}}}}", { y: "z", xz: "deep" }],
    ["pre-{{n}}-post", { n: 42 }],
    ["{{o}}", { o: { k: 1 } }],
    ["{{t}}", { t: true }],
    ["{{missing}} and {{a}}", { a: "ok" }],
    ["{{chain1}}", { chain1: "{{chain2}}", chain2: "{{chain3}}", chain3: "end" }],
    ["{{}}", { "": "empty" }],
    ["{{a b}}", { "a b": "space" }],
  ];
  for (const [tpl, vars] of cases) {
    it(JSON.stringify(tpl), () => {
      const ours = new VariableResolver([VariableScope.fromObject(vars, "x")]).replaceIn(tpl);
      const theirs = sdk.Property.replaceSubstitutions(tpl, new sdk.VariableList(null, Object.entries(vars).map(([key, value]) => ({ key, value }))));
      expect(ours).toBe(theirs);
    });
  }
});

describe("dynamic variables", () => {
  it("covers the documented name set", () => expect(dynamicVariableNames.length).toBe(117));
  it("generates shaped values", () => {
    const r = new VariableResolver([]);
    expect(r.replaceIn("{{$guid}}")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(Number(r.replaceIn("{{$timestamp}}"))).toBeCloseTo(Date.now() / 1000, -1);
    const n = Number(r.replaceIn("{{$randomInt}}"));
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThanOrEqual(1000);
    expect(r.replaceIn("{{$randomEmail}}")).toMatch(/@/);
    expect(r.replaceIn("{{$nope}}")).toBe("{{$nope}}");
  });
  it("a defined variable shadows a dynamic one", () => {
    const r = new VariableResolver([VariableScope.fromObject({ $guid: "fixed" }, "x")]);
    expect(r.replaceIn("{{$guid}}")).toBe("fixed");
  });
  it("each occurrence is generated independently", () => {
    const r = new VariableResolver([]);
    const out = r.replaceIn(Array(20).fill("{{$guid}}").join(","));
    expect(new Set(out.split(",")).size).toBe(20);
  });
  it("lists references", () => expect(referencedVariables("{{a}}/{{b}}")).toEqual(["a", "b"]));
});
