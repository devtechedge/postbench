import type { EnvironmentFile, Variable } from "./types.js";
import { dynamicVariables } from "./dynamic.js";

/** `{{name}}` reference syntax; mirrors the public SDK pattern `/{{([^{}]*?)}}/g`. */
export const VARIABLE_PATTERN = /\{\{([^{}]*?)\}\}/g;

/** Nested substitution passes before giving up (same bound as the SDK). */
export const MAX_SUBSTITUTION_PASSES = 19;

export type ScopeName = "local" | "data" | "environment" | "collection" | "globals" | "iterationData";

const enabled = (v: Variable) => v.disabled !== true && v.enabled !== false;
const keyOf = (v: Variable) => v.key ?? v.id ?? "";

/**
 * An ordered list of variables. Duplicate keys are allowed; reads return the
 * last enabled entry, writes update that entry or append a new one.
 */
export class VariableScope {
  values: Variable[];
  constructor(readonly name: ScopeName | string, values: Variable[] = []) {
    this.values = values.map((v) => ({ ...v }));
  }

  static fromEnvironment(file: EnvironmentFile, name: ScopeName = "environment"): VariableScope {
    return new VariableScope(
      name,
      file.values.map((v) => ({ key: v.key, value: v.value, type: v.type as Variable["type"], disabled: v.enabled === false })),
    );
  }

  static fromObject(obj: Record<string, unknown>, name: ScopeName | string): VariableScope {
    return new VariableScope(name, Object.entries(obj).map(([key, value]) => ({ key, value })));
  }

  private find(key: string): Variable | undefined {
    for (let i = this.values.length - 1; i >= 0; i--) {
      const v = this.values[i]!;
      if (keyOf(v) === key && enabled(v)) return v;
    }
    return undefined;
  }

  has(key: string): boolean {
    return this.find(key) !== undefined;
  }

  get(key: string): unknown {
    return this.find(key)?.value;
  }

  set(key: string, value: unknown, type?: Variable["type"]): void {
    const v = this.find(key);
    if (v) {
      v.value = value;
      if (type) v.type = type;
    } else {
      this.values.push(type ? { key, value, type } : { key, value });
    }
  }

  unset(key: string): void {
    this.values = this.values.filter((v) => keyOf(v) !== key);
  }

  clear(): void {
    this.values = [];
  }

  toObject(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const v of this.values) if (enabled(v)) out[keyOf(v)] = v.value;
    return out;
  }

  toJSON(): Variable[] {
    return this.values.map((v) => ({ ...v }));
  }

  /** Writes back into a Postman environment/globals export shape. */
  toEnvironment(base: Partial<EnvironmentFile> = {}): EnvironmentFile {
    return {
      ...base,
      values: this.values.map((v) => ({
        key: keyOf(v),
        value: v.value,
        type: v.type ?? "default",
        enabled: enabled(v),
      })),
    };
  }
}

export function stringifyValue(value: unknown): string {
  // The SDK coerces with String(), so objects become "[object Object]".
  if (value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

/**
 * Resolves names across scopes ordered narrowest first. Postman's runtime
 * passes `_variables, data, environment, collectionVariables, globals`.
 */
export class VariableResolver {
  constructor(readonly scopes: VariableScope[], readonly options: { dynamic?: boolean } = {}) {}

  lookup(key: string): { found: boolean; value?: unknown; scope?: string } {
    for (const s of this.scopes) {
      if (s.has(key)) return { found: true, value: s.get(key), scope: s.name };
    }
    if (this.options.dynamic !== false && key.startsWith("$")) {
      const gen = dynamicVariables[key];
      if (gen) return { found: true, value: gen.generator(), scope: "dynamic" };
    }
    return { found: false };
  }

  get(key: string): unknown {
    return this.lookup(key).value;
  }

  has(key: string): boolean {
    return this.scopes.some((s) => s.has(key));
  }

  /** Replaces `{{name}}` references, re-scanning for nested references. */
  replaceIn(template: string): string {
    if (typeof template !== "string" || !template.includes("{{")) return template;
    let out = template;
    for (let pass = 0; pass < MAX_SUBSTITUTION_PASSES; pass++) {
      let replaced = 0;
      out = out.replace(VARIABLE_PATTERN, (match, name: string) => {
        const r = this.lookup(name);
        if (!r.found || r.value === undefined) return match;
        replaced++;
        return stringifyValue(r.value);
      });
      if (!replaced || !out.includes("{{")) break;
    }
    return out;
  }

  /** Deep-substitutes all strings in a JSON-like value. */
  replaceInObject<T>(value: T): T {
    if (typeof value === "string") return this.replaceIn(value) as T;
    if (Array.isArray(value)) return value.map((v) => this.replaceInObject(v)) as T;
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = this.replaceInObject(v);
      return out as T;
    }
    return value;
  }

  toObject(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (let i = this.scopes.length - 1; i >= 0; i--) Object.assign(out, this.scopes[i]!.toObject());
    return out;
  }
}

/** Lists `{{name}}` references in a string, in order of appearance. */
export function referencedVariables(text: string): string[] {
  return [...text.matchAll(VARIABLE_PATTERN)].map((m) => m[1]!);
}
