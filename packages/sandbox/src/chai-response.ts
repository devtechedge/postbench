// chai plugin for response assertions: pm.response.to.have.status(200) etc.
type ChaiStatic = typeof import("chai");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAssert = any;
type Res = { __pbResponse: true; code: number; status: string; headers: { get(k: string): string | undefined; has(k: string): boolean }; text(): string; json(): unknown; responseTime: number };

const isRes = (o: unknown): o is Res => !!o && typeof o === "object" && (o as Res).__pbResponse === true;
const installed = new WeakSet<object>();

export function installResponseAssertions(chai: ChaiStatic): void {
  if (installed.has(chai)) return;
  installed.add(chai);
  const A = chai.Assertion;
  const statusRange = (name: string, test: (c: number) => boolean, label: string) => {
    A.addProperty(name, function (this: AnyAssert) {
      const o = this._obj as unknown;
      if (!isRes(o)) throw new Error(`expected a response for .${name}`);
      this.assert(test(o.code), `expected response code to be ${label} but found ${o.code}`, `expected response code not to be ${label} but found ${o.code}`, label, o.code);
    });
  };
  A.overwriteProperty("ok", (_super: () => void) => function (this: AnyAssert) {
    const o = this._obj as unknown;
    if (isRes(o)) {
      this.assert(o.code >= 200 && o.code < 300, `expected response code to be 2XX but found ${o.code}`, `expected response code not to be 2XX but found ${o.code}`, 200, o.code);
    } else _super.call(this);
  });
  statusRange("success", (c) => c >= 200 && c < 300, "2XX");
  statusRange("info", (c) => c >= 100 && c < 200, "1XX");
  statusRange("redirection", (c) => c >= 300 && c < 400, "3XX");
  statusRange("clientError", (c) => c >= 400 && c < 500, "4XX");
  statusRange("serverError", (c) => c >= 500 && c < 600, "5XX");
  statusRange("accepted", (c) => c === 202, "202");
  statusRange("badRequest", (c) => c === 400, "400");
  statusRange("unauthorized", (c) => c === 401, "401");
  statusRange("forbidden", (c) => c === 403, "403");
  statusRange("notFound", (c) => c === 404, "404");
  statusRange("rateLimited", (c) => c === 429, "429");
  A.overwriteProperty("error", (_super: () => void) => function (this: AnyAssert) {
    const o = this._obj as unknown;
    if (isRes(o)) this.assert(o.code >= 400 && o.code < 600, `expected response code to be 4XX or 5XX but found ${o.code}`, `expected response code not to be 4XX or 5XX but found ${o.code}`);
    else _super.call(this);
  });
  A.addMethod("status", function (this: AnyAssert, expected: number | string) {
    const o = this._obj as Res;
    if (typeof expected === "number") this.assert(o.code === expected, `expected response to have status code #{exp} but got #{act}`, `expected response to not have status code #{act}`, expected, o.code);
    else this.assert(o.status === expected, `expected response to have status reason #{exp} but got #{act}`, `expected response to not have status reason #{act}`, expected, o.status);
  });
  A.addMethod("header", function (this: AnyAssert, key: string, value?: string) {
    const o = this._obj as Res;
    if (!isRes(o)) throw new Error("expected a response for .header()");
    if (value === undefined) this.assert(o.headers.has(key), `expected response to have header with key '${key}'`, `expected response to not have header with key '${key}'`, true, o.headers.has(key));
    else this.assert(o.headers.get(key) === value, `expected '${key}' response header to be '${value}' but got '${o.headers.get(key)}'`, `expected '${key}' response header to not be '${value}'`, value, o.headers.get(key));
  });
  A.addMethod("body", function (this: AnyAssert, expected?: unknown) {
    const o = this._obj as Res;
    const text = o.text();
    if (expected === undefined) this.assert(text.length > 0, "expected response to have content in body", "expected response to not have content in body");
    else if (expected instanceof RegExp) this.assert(expected.test(text), `expected response body text to match ${expected}`, `expected response body text not to match ${expected}`);
    else if (typeof expected === "string") this.assert(text === expected, "expected response body to equal #{exp} but got #{act}", "expected response body to not equal #{exp}", expected, text);
    else new A(o.json()).to.deep.equal(expected);
  });
  A.addMethod("jsonBody", function (this: AnyAssert, path?: string, value?: unknown) {
    const o = this._obj as Res;
    let data: unknown;
    try {
      data = o.json();
    } catch {
      this.assert(false, "expected response body to be a valid json", "", true, false);
      return;
    }
    if (path === undefined) return;
    const got = String(path).split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), data);
    if (arguments.length < 2) this.assert(got !== undefined, `expected response body json to have path '${path}'`, `expected response body json to not have path '${path}'`);
    else new A(got).to.deep.equal(value);
  });
  A.addProperty("json", function (this: AnyAssert) {
    const o = this._obj as Res;
    let ok = true;
    try {
      o.json();
    } catch {
      ok = false;
    }
    this.assert(ok, "expected response body to be a valid json", "expected response body not to be a valid json");
  });
  A.addMethod("responseTime", function (this: AnyAssert, max: number) {
    const o = this._obj as Res;
    this.assert(o.responseTime <= max, `expected response time to be at most ${max}ms but got ${o.responseTime}ms`, `expected response time to be above ${max}ms`);
  });
}
