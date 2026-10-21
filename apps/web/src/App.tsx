import { useEffect, useMemo, useState } from "react";
import type { Auth, Body, Collection, Header, Item, ItemGroup, QueryParam, RequestObject } from "@postbench/core";
import { isItemGroup, parseEnvironment, scriptText, serializeCollection, toUrlObject, urlToString, parseUrl } from "@postbench/core";
import { generate, languages, type Language } from "@postbench/codegen";
import { importAny } from "@postbench/importers";
import { download, getItem, loadState, resetState, saveState, scopesFor, type AppState, type ItemPath } from "./store";
import { executeItem, runAll, type ExecResult } from "./runtime";
import { isDesktop } from "./transport";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const req = (i: Item): RequestObject => (typeof i.request === "string" ? { url: i.request, method: "GET" } : i.request);
const text = (b?: Uint8Array) => (b ? new TextDecoder().decode(b) : "");
const keyOf = (p: ItemPath) => p.join(".");

function Tree({ nodes, path, open, onOpen, active }: { nodes: (Item | ItemGroup)[]; path: number[]; open: (p: ItemPath) => void; onOpen: Set<string>; active?: string }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  return (
    <ul className="tree">
      {nodes.map((n, i) => {
        const p = [...path, i] as unknown as ItemPath;
        const k = keyOf(p);
        if (isItemGroup(n)) {
          return (
            <li key={k}>
              <button className="folder" onClick={() => setCollapsed({ ...collapsed, [k]: !collapsed[k] })}>
                {collapsed[k] ? "\u25b8" : "\u25be"} {n.name}
              </button>
              {!collapsed[k] && <Tree nodes={n.item} path={p} open={open} onOpen={onOpen} active={active} />}
            </li>
          );
        }
        const m = (req(n).method ?? "GET").toUpperCase();
        return (
          <li key={k}>
            <button className={`req ${active === k ? "active" : ""}`} onClick={() => open(p)} data-testid={`item-${n.name}`}>
              <span className={`m m-${m}`}>{m}</span> {n.name}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function KVEditor({ rows, onChange, testid }: { rows: { key: string | null; value: string | null; disabled?: boolean }[]; onChange: (r: { key: string; value: string; disabled?: boolean }[]) => void; testid?: string }) {
  const list: { key: string; value: string; disabled?: boolean }[] = [...rows.map((r) => ({ key: r.key ?? "", value: r.value ?? "", disabled: r.disabled })), { key: "", value: "" }];
  const update = (i: number, patch: Partial<{ key: string; value: string; disabled: boolean }>) => {
    const next = list.map((r, j) => (j === i ? { ...r, ...patch } : r)).filter((r, j) => r.key || r.value || j < list.length - 1);
    onChange(next.filter((r) => r.key || r.value));
  };
  return (
    <table className="kv" data-testid={testid}>
      <tbody>
        {list.map((r, i) => (
          <tr key={i}>
            <td><input type="checkbox" checked={!r.disabled} onChange={(e) => update(i, { disabled: !e.target.checked })} disabled={i === list.length - 1} /></td>
            <td><input placeholder="Key" value={r.key} onChange={(e) => update(i, { key: e.target.value })} /></td>
            <td><input placeholder="Value" value={r.value} onChange={(e) => update(i, { value: e.target.value })} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function pretty(body: string, ct: string): string {
  if (/json/.test(ct) || /^\s*[[{]/.test(body)) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return body;
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [tabs, setTabs] = useState<ItemPath[]>([[0, 0, 0]]);
  const [active, setActive] = useState<ItemPath>([0, 0, 0]);
  const [reqTab, setReqTab] = useState("params");
  const [resTab, setResTab] = useState("pretty");
  const [results, setResults] = useState<Record<string, ExecResult & { busy?: boolean }>>({});
  const [modal, setModal] = useState<null | "import" | "code" | "env" | "runner">(null);
  const [lang, setLang] = useState<Language>("curl");
  const [importText, setImportText] = useState("");
  const [runLog, setRunLog] = useState<{ name: string; r: ExecResult }[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => saveState(state), [state]);
  const item = getItem(state, active);
  const result = results[keyOf(active)];

  const mutate = (fn: (r: RequestObject) => void) => {
    setState((s) => {
      const next = structuredClone(s);
      const it = getItem(next, active);
      if (it) {
        if (typeof it.request === "string") it.request = { url: it.request, method: "GET" };
        fn(it.request as RequestObject);
      }
      return next;
    });
  };
  const mutateItem = (fn: (i: Item) => void) =>
    setState((s) => {
      const next = structuredClone(s);
      const it = getItem(next, active);
      if (it) fn(it);
      return next;
    });

  const open = (p: ItemPath) => {
    if (!tabs.some((t) => keyOf(t) === keyOf(p))) setTabs([...tabs, p]);
    setActive(p);
  };
  const close = (p: ItemPath) => {
    const rest = tabs.filter((t) => keyOf(t) !== keyOf(p));
    setTabs(rest);
    if (keyOf(active) === keyOf(p) && rest.length) setActive(rest[rest.length - 1]!);
  };

  const commitScopes = (ci: number, sc: ReturnType<typeof scopesFor>) =>
    setState((s) => {
      const next = structuredClone(s);
      if (next.environments[next.activeEnv]) next.environments[next.activeEnv] = sc.environment.toEnvironment(next.environments[next.activeEnv]);
      next.globals = sc.globals.toEnvironment(next.globals);
      next.collections[ci]!.variable = sc.collection.toJSON();
      return next;
    });

  const send = async () => {
    if (!item) return;
    const k = keyOf(active);
    setResults((r) => ({ ...r, [k]: { ...(r[k] ?? { assertions: [], scriptErrors: [], console: [] }), busy: true } as never }));
    const sc = scopesFor(state, active[0]);
    const r = await executeItem(state.collections[active[0]]!, item, sc);
    commitScopes(active[0], sc);
    setResults((x) => ({ ...x, [k]: r }));
    setState((s) => ({ ...s, history: [{ at: Date.now(), method: r.request.method, url: r.request.url, code: r.response?.code, time: r.response?.responseTime }, ...s.history].slice(0, 100) }));
  };

  const runCollection = async (ci: number) => {
    setModal("runner");
    setRunLog([]);
    const sc = scopesFor(state, ci);
    await runAll(state.collections[ci]!, sc, (name, r) => setRunLog((l) => [...l, { name, r }]));
    commitScopes(ci, sc);
  };

  const doImport = (raw: string) => {
    try {
      const t = raw.trim();
      if (t.startsWith("{") && /"values"\s*:/.test(t) && !/"item"\s*:/.test(t)) {
        const env = parseEnvironment(t);
        setState((s) => ({ ...s, environments: [...s.environments, env], activeEnv: s.environments.length }));
        setMsg(`Imported environment ${env.name ?? ""}`);
      } else {
        const { kind, collection } = importAny(t);
        setState((s) => ({ ...s, collections: [...s.collections, collection] }));
        setMsg(`Imported ${kind}: ${collection.info.name}`);
      }
      setModal(null);
      setImportText("");
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`);
    }
  };

  const r = item ? req(item) : undefined;
  const url = r ? toUrlObject(r.url) : undefined;
  const urlText = url ? url.raw ?? urlToString(url) : "";
  const setUrl = (v: string) => mutate((q) => {
    const parsed = parseUrl(v);
    const old = toUrlObject(q.url);
    parsed.variable = (parsed.variable ?? []).map((pv) => old.variable?.find((o) => o.key === pv.key) ?? pv);
    q.url = parsed;
  });
  const setQuery = (rows: QueryParam[]) => mutate((q) => {
    const u = toUrlObject(q.url);
    u.query = rows;
    const base = (u.raw ?? "").split("?")[0];
    const qs = rows.filter((x) => !x.disabled).map((x) => (x.value ? `${x.key}=${x.value}` : `${x.key}`)).join("&");
    u.raw = qs ? `${base}?${qs}` : base;
    q.url = u;
  });
  const headers = (r?.header && Array.isArray(r.header) ? r.header : []) as Header[];
  const body: Body = r?.body ?? {};
  const auth: Auth = (r?.auth as Auth) ?? ({ type: "inherit" } as unknown as Auth);
  const authVal = (k: string) => String(((auth[auth.type] as { key: string; value?: unknown }[] | undefined) ?? []).find((a) => a.key === k)?.value ?? "");
  const setAuth = (type: string, k?: string, v?: string) => mutate((q) => {
    if (type === "inherit") {
      delete q.auth;
      return;
    }
    const cur = (q.auth && (q.auth as Auth).type === type ? (q.auth as Auth)[type] : []) as { key: string; value: string }[];
    const list = k ? [...cur.filter((a) => a.key !== k), { key: k, value: v ?? "" }] : cur;
    q.auth = { type, [type]: list } as Auth;
  });
  const script = (listen: string) => scriptText(item?.event?.find((e) => e.listen === listen)?.script?.exec);
  const setScript = (listen: string, code: string) => mutateItem((it) => {
    it.event = (it.event ?? []).filter((e) => e.listen !== listen);
    if (code.trim()) it.event.push({ listen, script: { type: "text/javascript", exec: code.split("\n") } });
  });

  const ct = result?.response?.headers.find((h) => h.key.toLowerCase() === "content-type")?.value ?? "";
  const bodyText = text(result?.response?.body);
  const snippet = useMemo(() => (modal === "code" && result?.request ? generate(lang, result.request) : modal === "code" && item ? (() => {
    try {
      const sc = scopesFor(state, active[0]);
      return generate(lang, { method: (r?.method ?? "GET").toUpperCase(), url: urlText.replace(/\{\{(\w+)\}\}/g, (m, n) => String(sc.collection.get(n) ?? sc.environment.get(n) ?? m)), headers: headers.filter((h) => !h.disabled).map((h) => ({ key: h.key, value: h.value })), body: body.mode === "raw" ? { kind: "text", text: body.raw ?? "" } : { kind: "none" }, auth: r?.auth as Auth });
    } catch {
      return "";
    }
  })() : ""), [modal, lang, result, item]);

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><img src="./favicon.svg" alt="" /> Postbench <span className="tag">{isDesktop() ? "desktop" : "web demo"}</span></div>
        <div className="actions">
          <button onClick={() => setModal("import")} data-testid="import-open">Import</button>
          <select value={state.activeEnv} onChange={(e) => setState({ ...state, activeEnv: Number(e.target.value) })} data-testid="env-select">
            <option value={-1}>No environment</option>
            {state.environments.map((e, i) => <option key={i} value={i}>{e.name ?? `Environment ${i + 1}`}</option>)}
          </select>
          <button onClick={() => setModal("env")}>Variables</button>
          <button onClick={() => { setState(resetState()); setResults({}); }} title="Restore the demo data">Reset</button>
          <ThemeToggle />
        </div>
      </header>
      <div className="main">
        <aside className="side">
          {state.collections.map((c, ci) => (
            <section key={ci} className="coll">
              <div className="coll-head">
                <strong>{c.info.name}</strong>
                <span>
                  <button title="Run collection" onClick={() => runCollection(ci)} data-testid={`run-${ci}`}>Run</button>
                  <button title="Export as Collection v2.1" onClick={() => download(`${c.info.name}.postman_collection.json`, serializeCollection(c))}>Export</button>
                  <button title="Remove" onClick={() => setState({ ...state, collections: state.collections.filter((_, j) => j !== ci) })}>x</button>
                </span>
              </div>
              <Tree nodes={c.item} path={[ci]} open={open} onOpen={new Set()} active={keyOf(active)} />
            </section>
          ))}
          <section className="history">
            <strong>History</strong>
            <ul>{state.history.slice(0, 15).map((h, i) => <li key={i}><span className={`m m-${h.method}`}>{h.method}</span> <span className="code">{h.code ?? "ERR"}</span> {h.url}</li>)}</ul>
          </section>
        </aside>
        <main className="work">
          <nav className="tabs">
            {tabs.map((t) => {
              const it = getItem(state, t);
              return (
                <span key={keyOf(t)} className={`tab ${keyOf(t) === keyOf(active) ? "on" : ""}`}>
                  <button onClick={() => setActive(t)}>{it?.name ?? "?"}</button>
                  <button className="x" onClick={() => close(t)}>x</button>
                </span>
              );
            })}
          </nav>
          {item && r ? (
            <>
              <div className="urlbar">
                <select value={(r.method ?? "GET").toUpperCase()} onChange={(e) => mutate((q) => { q.method = e.target.value; })} data-testid="method">
                  {METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
                <input value={urlText} onChange={(e) => setUrl(e.target.value)} data-testid="url" spellCheck={false} />
                <button className="send" onClick={send} disabled={result?.busy} data-testid="send">{result?.busy ? "Sending" : "Send"}</button>
                <button onClick={() => setModal("code")} title="Code snippet" data-testid="code-open">{"</>"}</button>
              </div>
              <div className="subtabs">
                {["params", "headers", "body", "auth", "pre-request", "tests"].map((t) => <button key={t} className={reqTab === t ? "on" : ""} onClick={() => setReqTab(t)}>{t}</button>)}
              </div>
              <div className="pane">
                {reqTab === "params" && (
                  <>
                    <KVEditor rows={url?.query ?? []} onChange={(rows) => setQuery(rows)} testid="params" />
                    {!!url?.variable?.length && (
                      <>
                        <h4>Path variables</h4>
                        <KVEditor rows={url.variable.map((v) => ({ key: v.key ?? "", value: String(v.value ?? "") }))} onChange={(rows) => mutate((q) => { const u = toUrlObject(q.url); u.variable = rows; q.url = u; })} />
                      </>
                    )}
                  </>
                )}
                {reqTab === "headers" && <KVEditor rows={headers} onChange={(rows) => mutate((q) => { q.header = rows; })} testid="headers" />}
                {reqTab === "body" && (
                  <div>
                    <div className="radios">
                      {["none", "raw", "urlencoded", "formdata", "graphql"].map((m) => (
                        <label key={m}><input type="radio" checked={(body.mode ?? "none") === m} onChange={() => mutate((q) => { q.body = m === "none" ? undefined : { ...(q.body ?? {}), mode: m as Body["mode"] }; })} /> {m}</label>
                      ))}
                    </div>
                    {body.mode === "raw" && <textarea className="code" value={body.raw ?? ""} onChange={(e) => mutate((q) => { q.body = { ...q.body, mode: "raw", raw: e.target.value }; })} />}
                    {body.mode === "urlencoded" && <KVEditor rows={(body.urlencoded ?? []).map((x) => ({ key: x.key, value: x.value ?? "", disabled: x.disabled }))} onChange={(rows) => mutate((q) => { q.body = { ...q.body, mode: "urlencoded", urlencoded: rows }; })} />}
                    {body.mode === "formdata" && <KVEditor rows={(body.formdata ?? []).map((x) => ({ key: x.key, value: x.value ?? "", disabled: x.disabled }))} onChange={(rows) => mutate((q) => { q.body = { ...q.body, mode: "formdata", formdata: rows.map((x) => ({ ...x, type: "text" })) }; })} />}
                    {body.mode === "graphql" && (
                      <div className="split">
                        <textarea className="code" placeholder="query" value={body.graphql?.query ?? ""} onChange={(e) => mutate((q) => { q.body = { ...q.body, mode: "graphql", graphql: { ...q.body?.graphql, query: e.target.value } }; })} />
                        <textarea className="code" placeholder="variables (JSON)" value={body.graphql?.variables ?? ""} onChange={(e) => mutate((q) => { q.body = { ...q.body, mode: "graphql", graphql: { ...q.body?.graphql, variables: e.target.value } }; })} />
                      </div>
                    )}
                  </div>
                )}
                {reqTab === "auth" && (
                  <div className="auth">
                    <select value={auth.type} onChange={(e) => setAuth(e.target.value)}>
                      {["inherit", "noauth", "basic", "bearer", "apikey", "oauth2", "digest", "awsv4"].map((t) => <option key={t}>{t}</option>)}
                    </select>
                    {(({ basic: ["username", "password"], digest: ["username", "password"], bearer: ["token"], apikey: ["key", "value", "in"], oauth2: ["accessToken", "headerPrefix"], awsv4: ["accessKey", "secretKey", "region", "service"] }) as Record<string, string[]>)[auth.type]?.map((k) => (
                      <label key={k}>{k}<input value={authVal(k)} onChange={(e) => setAuth(auth.type, k, e.target.value)} /></label>
                    ))}
                  </div>
                )}
                {reqTab === "pre-request" && <textarea className="code" data-testid="prerequest" value={script("prerequest")} onChange={(e) => setScript("prerequest", e.target.value)} />}
                {reqTab === "tests" && <textarea className="code" data-testid="tests" value={script("test")} onChange={(e) => setScript("test", e.target.value)} />}
              </div>
              <section className="response" data-testid="response">
                <div className="res-head">
                  <div className="subtabs">
                    {["pretty", "raw", "preview", "headers", "cookies", "timings", "tests"].map((t) => (
                      <button key={t} className={resTab === t ? "on" : ""} onClick={() => setResTab(t)}>
                        {t}{t === "tests" && result?.assertions.length ? ` (${result.assertions.filter((a) => a.passed).length}/${result.assertions.length})` : ""}
                      </button>
                    ))}
                  </div>
                  {result?.response && (
                    <div className="meta" data-testid="status">
                      <span className={result.response.code < 400 ? "ok" : "bad"}>{result.response.code} {result.response.status}</span>
                      <span>{result.response.responseTime} ms</span>
                      <span>{result.response.responseSize} B</span>
                    </div>
                  )}
                </div>
                {result?.error && <div className="err">{result.error}</div>}
                {result?.scriptErrors.map((e, i) => <div className="err" key={i}>{e}</div>)}
                {result?.response && (
                  <div className="pane">
                    {resTab === "pretty" && <pre className="code" data-testid="pretty">{pretty(bodyText, ct)}</pre>}
                    {resTab === "raw" && <pre className="code">{bodyText}</pre>}
                    {resTab === "preview" && <iframe title="preview" sandbox="" srcDoc={/html/.test(ct) ? bodyText : `<pre>${bodyText.replace(/</g, "&lt;")}</pre>`} />}
                    {resTab === "headers" && <table className="kv ro"><tbody>{result.response.headers.map((h, i) => <tr key={i}><td>{h.key}</td><td>{h.value}</td></tr>)}</tbody></table>}
                    {resTab === "cookies" && (result.response.cookies?.length ? <table className="kv ro"><tbody>{result.response.cookies.map((c, i) => <tr key={i}><td>{c.name}</td><td>{c.value}</td><td>{c.domain}</td><td>{c.path}</td></tr>)}</tbody></table> : <p className="muted">{isDesktop() ? "No cookies" : "Browsers hide Set-Cookie from scripts; cookies show in the desktop app."}</p>)}
                    {resTab === "timings" && <table className="kv ro"><tbody>{Object.entries(result.response.timings ?? {}).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v} ms</td><td><div className="bar" style={{ width: `${Math.min(100, (100 * Number(v)) / Math.max(1, result.response!.responseTime))}%` }} /></td></tr>)}</tbody></table>}
                    {resTab === "tests" && <ul className="tests" data-testid="test-results">{result.assertions.map((a, i) => <li key={i} className={a.passed ? "pass" : "fail"}>{a.skipped ? "SKIP" : a.passed ? "PASS" : "FAIL"} {a.name}{a.error ? `: ${a.error.message}` : ""}</li>)}</ul>}
                  </div>
                )}
                {!result && <p className="muted">Send the request to see the response.</p>}
              </section>
            </>
          ) : (
            <p className="muted pad">Pick a request from the sidebar.</p>
          )}
        </main>
      </div>
      {msg && <div className="toast" onClick={() => setMsg("")}>{msg}</div>}
      {modal && (
        <div className="modal-bg" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {modal === "import" && (
              <>
                <h3>Import</h3>
                <p className="muted">Postman collection or environment (v2.0/v2.1), OpenAPI 3 (JSON or YAML), HAR, or a curl command.</p>
                <input type="file" accept=".json,.yaml,.yml,.har,.txt" onChange={async (e) => { const f = e.target.files?.[0]; if (f) doImport(await f.text()); }} />
                <textarea className="code" data-testid="import-text" placeholder="...or paste here" value={importText} onChange={(e) => setImportText(e.target.value)} />
                <button onClick={() => doImport(importText)} data-testid="import-go">Import</button>
              </>
            )}
            {modal === "code" && (
              <>
                <h3>Code snippet</h3>
                <select value={lang} onChange={(e) => setLang(e.target.value as Language)}>{languages.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
                <pre className="code" data-testid="snippet">{snippet}</pre>
                <button onClick={() => navigator.clipboard?.writeText(snippet)}>Copy</button>
              </>
            )}
            {modal === "env" && (
              <>
                <h3>Variables</h3>
                {state.environments[state.activeEnv] && (
                  <>
                    <h4>Environment: {state.environments[state.activeEnv]!.name}</h4>
                    <KVEditor rows={state.environments[state.activeEnv]!.values.map((v) => ({ key: v.key, value: String(v.value ?? ""), disabled: v.enabled === false }))} onChange={(rows) => setState((s) => { const n = structuredClone(s); n.environments[n.activeEnv]!.values = rows.map((x) => ({ key: x.key, value: x.value, enabled: !x.disabled })); return n; })} />
                    <button onClick={() => download(`${state.environments[state.activeEnv]!.name}.postman_environment.json`, serializeCollection(state.environments[state.activeEnv]!))}>Export environment</button>
                  </>
                )}
                <h4>Collection: {state.collections[active[0]]?.info.name}</h4>
                <KVEditor rows={(state.collections[active[0]]?.variable ?? []).map((v) => ({ key: v.key ?? "", value: String(v.value ?? ""), disabled: v.disabled }))} onChange={(rows) => setState((s) => { const n = structuredClone(s); n.collections[active[0]]!.variable = rows; return n; })} />
                <h4>Globals</h4>
                <KVEditor rows={state.globals.values.map((v) => ({ key: v.key, value: String(v.value ?? ""), disabled: v.enabled === false }))} onChange={(rows) => setState((s) => ({ ...s, globals: { ...s.globals, values: rows.map((x) => ({ key: x.key, value: x.value, enabled: !x.disabled })) } }))} />
              </>
            )}
            {modal === "runner" && (
              <>
                <h3>Collection run</h3>
                <ul className="tests" data-testid="runner">
                  {runLog.map(({ name, r }, i) => (
                    <li key={i}>
                      <strong>{name}</strong> {r.response ? `${r.response.code} in ${r.response.responseTime} ms` : r.error}
                      <ul>{r.assertions.map((a, j) => <li key={j} className={a.passed ? "pass" : "fail"}>{a.passed ? "PASS" : "FAIL"} {a.name}</li>)}</ul>
                    </li>
                  ))}
                </ul>
                <p data-testid="runner-summary">{runLog.reduce((n, x) => n + x.r.assertions.filter((a) => a.passed).length, 0)} passed, {runLog.reduce((n, x) => n + x.r.assertions.filter((a) => !a.passed).length, 0)} failed</p>
              </>
            )}
            <button className="close" onClick={() => setModal(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<string>(() => document.documentElement.dataset.theme ?? "dark");
  const next = theme === "dark" ? "light" : "dark";
  const flip = () => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("postbench.theme", next);
    } catch {
      // Storage can be unavailable in private windows.
    }
    setTheme(next);
  };
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <button className="theme-toggle" onClick={flip} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`} data-testid="theme-toggle">
      <svg viewBox="0 0 24 24" className={theme === "dark" ? "" : "off"} {...stroke}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      <svg viewBox="0 0 24 24" className={theme === "light" ? "" : "off"} {...stroke}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
    </button>
  );
}
