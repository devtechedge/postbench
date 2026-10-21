import type { KV } from "./types.js";

/** Case-insensitive key/value list with the PropertyList style API scripts use. */
export class KVList {
  constructor(private items: KV[], private caseInsensitive = true) {}
  private eq(a: string, b: string) {
    return this.caseInsensitive ? a.toLowerCase() === b.toLowerCase() : a === b;
  }
  private active() {
    return this.items.filter((i) => !i.disabled);
  }
  get(key: string): string | undefined {
    const all = this.active().filter((i) => this.eq(i.key, key));
    return all.length ? all[all.length - 1]!.value : undefined;
  }
  one(key: string): KV | undefined {
    return this.active().find((i) => this.eq(i.key, key));
  }
  has(key: string | KV, value?: string): boolean {
    const k = typeof key === "string" ? key : key.key;
    return this.active().some((i) => this.eq(i.key, k) && (value === undefined || i.value === value));
  }
  add(item: KV | string): void {
    this.items.push(typeof item === "string" ? parseLine(item) : { key: item.key, value: String(item.value ?? "") });
  }
  append(item: KV | string): void {
    this.add(item);
  }
  upsert(item: KV | string): void {
    const kv = typeof item === "string" ? parseLine(item) : item;
    const i = this.items.findIndex((x) => this.eq(x.key, kv.key));
    if (i >= 0) this.items[i] = { ...this.items[i]!, value: String(kv.value ?? "") };
    else this.add(kv);
  }
  remove(predicate: string | ((kv: KV) => boolean)): void {
    const keep = (kv: KV) => (typeof predicate === "string" ? !this.eq(kv.key, predicate) : !predicate(kv));
    const kept = this.items.filter(keep);
    this.items.splice(0, this.items.length, ...kept);
  }
  clear(): void {
    this.items.splice(0, this.items.length);
  }
  all(): KV[] {
    return this.active().map((i) => ({ ...i }));
  }
  count(): number {
    return this.active().length;
  }
  each(fn: (kv: KV) => void): void {
    this.active().forEach(fn);
  }
  map<T>(fn: (kv: KV) => T): T[] {
    return this.active().map(fn);
  }
  filter(fn: (kv: KV) => boolean): KV[] {
    return this.active().filter(fn);
  }
  find(fn: (kv: KV) => boolean): KV | undefined {
    return this.active().find(fn);
  }
  toObject(): Record<string, string> {
    const o: Record<string, string> = {};
    for (const i of this.active()) o[i.key] = i.value;
    return o;
  }
  toJSON(): KV[] {
    return this.all();
  }
  toString(): string {
    return this.active().map((i) => `${i.key}: ${i.value}`).join("\n");
  }
  get length(): number {
    return this.count();
  }
}

function parseLine(line: string): KV {
  const i = line.indexOf(":");
  return i >= 0 ? { key: line.slice(0, i).trim(), value: line.slice(i + 1).trim() } : { key: line.trim(), value: "" };
}

/** A mutable URL facade with the methods scripts commonly call. */
export class ScriptUrl {
  query: KVList;
  private queryItems: KV[] = [];
  protocol = "";
  host: string[] = [];
  port = "";
  path: string[] = [];
  hash = "";
  constructor(raw: string) {
    this.query = new KVList(this.queryItems, false);
    this.update(raw);
  }
  update(raw: string): void {
    let rest = raw;
    const h = rest.indexOf("#");
    this.hash = h >= 0 ? rest.slice(h + 1) : "";
    if (h >= 0) rest = rest.slice(0, h);
    const q = rest.indexOf("?");
    const qs = q >= 0 ? rest.slice(q + 1) : "";
    if (q >= 0) rest = rest.slice(0, q);
    const pm = /^([a-z][a-z0-9+.-]*):\/\//i.exec(rest);
    this.protocol = pm ? pm[1]! : "";
    if (pm) rest = rest.slice(pm[0].length);
    const s = rest.indexOf("/");
    let hostPort = s >= 0 ? rest.slice(0, s) : rest;
    this.path = s >= 0 ? rest.slice(s + 1).split("/") : [];
    const port = /:(\d+)$/.exec(hostPort);
    this.port = port ? port[1]! : "";
    if (port) hostPort = hostPort.slice(0, port.index);
    this.host = hostPort ? hostPort.split(".") : [];
    this.queryItems.splice(0, this.queryItems.length, ...qs.split("&").filter(Boolean).map((p) => {
      const i = p.indexOf("=");
      return i >= 0 ? { key: p.slice(0, i), value: p.slice(i + 1) } : { key: p, value: "" };
    }));
  }
  getHost(): string {
    return this.host.join(".");
  }
  getPath(unresolved?: boolean): string {
    void unresolved;
    return "/" + this.path.join("/");
  }
  getQueryString(): string {
    return this.query.all().map((q) => (q.value === "" ? q.key : `${q.key}=${q.value}`)).join("&");
  }
  getPathWithQuery(): string {
    const q = this.getQueryString();
    return this.getPath() + (q ? `?${q}` : "");
  }
  getRemote(): string {
    return this.getHost() + (this.port ? `:${this.port}` : "");
  }
  addQueryParams(params: KV[] | string): void {
    if (typeof params === "string") new ScriptUrl(`x://x?${params}`).query.all().forEach((p) => this.query.add(p));
    else params.forEach((p) => this.query.add(p));
  }
  removeQueryParams(keys: string | string[]): void {
    for (const k of Array.isArray(keys) ? keys : [keys]) this.query.remove(k);
  }
  toString(): string {
    let s = this.protocol ? `${this.protocol}://` : "";
    s += this.getHost();
    if (this.port) s += `:${this.port}`;
    if (this.path.length) s += "/" + this.path.join("/");
    const q = this.getQueryString();
    if (q) s += `?${q}`;
    if (this.hash) s += `#${this.hash}`;
    return s;
  }
  toJSON(): string {
    return this.toString();
  }
}
