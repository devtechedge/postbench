import type { Collection, EnvironmentFile, Item } from "@postbench/core";
import { isItemGroup, VariableScope } from "@postbench/core";
import { sampleCollection, sampleEnvironment } from "./sample";

export interface HistoryEntry {
  at: number;
  method: string;
  url: string;
  code?: number;
  time?: number;
}

export interface AppState {
  collections: Collection[];
  environments: EnvironmentFile[];
  activeEnv: number;
  globals: EnvironmentFile;
  history: HistoryEntry[];
}

const KEY = "postbench.state.v1";

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    // fall through to defaults
  }
  return { collections: [structuredClone(sampleCollection)], environments: [structuredClone(sampleEnvironment)], activeEnv: 0, globals: { name: "Globals", values: [] }, history: [] };
}

export function saveState(s: AppState): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function resetState(): AppState {
  localStorage.removeItem(KEY);
  return loadState();
}

/** Address of an item: collection index plus child indexes. */
export type ItemPath = [number, ...number[]];

export function getItem(s: AppState, path: ItemPath): Item | undefined {
  let node: { item: unknown[] } | undefined = s.collections[path[0]];
  let found: unknown;
  for (const i of path.slice(1)) {
    found = node?.item[i];
    node = found && isItemGroup(found as Item) ? (found as { item: unknown[] }) : undefined;
  }
  return found && !isItemGroup(found as Item) ? (found as Item) : undefined;
}

export function scopesFor(s: AppState, ci: number) {
  const env = s.environments[s.activeEnv];
  return {
    environment: env ? VariableScope.fromEnvironment(env) : new VariableScope("environment"),
    globals: VariableScope.fromEnvironment(s.globals, "globals"),
    collection: new VariableScope("collection", s.collections[ci]?.variable ?? []),
  };
}

export function download(name: string, text: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
