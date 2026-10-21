import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCollection, serializeCollection, validateCollection, walkItems } from "../src/index.js";

const dir = (d: string) => join(__dirname, "fixtures", d);

describe("real Postman exports round-trip byte for byte", () => {
  const files = readdirSync(dir("exports")).filter((f) => f.endsWith(".json"));
  it("has fixtures", () => expect(files.length).toBeGreaterThanOrEqual(6));
  for (const f of files) {
    it(f, () => {
      const text = readFileSync(join(dir("exports"), f), "utf8");
      const parsed = parseCollection(text);
      expect(parsed.layout.indent).toBe("\t");
      expect(serializeCollection(parsed.collection, parsed.layout)).toBe(text);
      expect([...walkItems(parsed.collection)].length).toBeGreaterThan(0);
    });
  }
});

describe("newman integration collections", () => {
  const files = readdirSync(dir("newman")).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const text = readFileSync(join(dir("newman"), f), "utf8");
    const data = JSON.parse(text);
    if (!data.info) {
      it(`${f} is v1 and rejected with a clear message`, () => {
        expect(() => parseCollection(text)).toThrow(/v1 is not supported/);
      });
      continue;
    }
    it(`${f} parses and re-serializes to equal JSON`, () => {
      const p = parseCollection(text);
      expect(JSON.parse(serializeCollection(p.collection, p.layout))).toEqual(data);
    });
  }
});

describe("schema validation", () => {
  it("accepts every v2.1 export", () => {
    for (const f of readdirSync(dir("exports"))) {
      if (!f.endsWith(".json")) continue;
      const c = parseCollection(readFileSync(join(dir("exports"), f), "utf8"));
      if (c.version !== "v2.1") continue;
      const r = validateCollection(c.collection);
      expect(r.errors, f).toEqual([]);
    }
  });
  it("reports missing fields", () => {
    const r = validateCollection({ info: { schema: "x" } });
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toMatch(/item/);
  });
});

describe("layout", () => {
  it("keeps BOM, CRLF and trailing newline", () => {
    const text = '\ufeff{\r\n  "info": {\r\n    "name": "a",\r\n    "schema": "s"\r\n  },\r\n  "item": []\r\n}\r\n';
    const p = parseCollection(text);
    expect(p.layout).toEqual({ indent: "  ", trailingNewline: true, bom: true, crlf: true });
    expect(serializeCollection(p.collection, p.layout)).toBe(text);
  });
  it("rejects non-collections", () => {
    expect(() => parseCollection("{}")).toThrow(/Not a Postman collection/);
    expect(() => parseCollection("{")).toThrow(/Invalid JSON/);
  });
});
