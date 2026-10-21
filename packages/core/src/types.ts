// Types follow the public Postman Collection Format v2.1.0 JSON schema
// (schema/collection-v2.1.0.json). Unknown keys are preserved by keeping
// the parsed objects as plain JSON.

export interface Variable {
  key?: string;
  id?: string;
  value?: unknown;
  type?: "string" | "boolean" | "any" | "number" | "secret" | "default";
  name?: string;
  description?: Description;
  system?: boolean;
  disabled?: boolean;
  enabled?: boolean;
  [extra: string]: unknown;
}

export type Description = string | { content?: string; type?: string; version?: unknown } | null;

export interface Info {
  name: string;
  _postman_id?: string;
  description?: Description;
  version?: unknown;
  schema: string;
  [extra: string]: unknown;
}

export interface QueryParam {
  key: string | null;
  value: string | null;
  disabled?: boolean;
  description?: Description;
}

export interface UrlObject {
  raw?: string;
  protocol?: string;
  host?: string | string[];
  path?: string | (string | { type?: string; value?: string })[];
  port?: string;
  query?: QueryParam[];
  hash?: string;
  variable?: Variable[];
  /** userinfo (`user:password@`), kept by the SDK though not in the schema. */
  auth?: { user?: string; password?: string };
}

export type Url = string | UrlObject;

export interface Header {
  key: string;
  value: string;
  disabled?: boolean;
  description?: Description;
  [extra: string]: unknown;
}

export interface AuthAttribute {
  key: string;
  value?: unknown;
  type?: string;
}

export type AuthType =
  | "noauth" | "apikey" | "awsv4" | "basic" | "bearer" | "digest"
  | "edgegrid" | "hawk" | "ntlm" | "oauth1" | "oauth2" | "jwt" | "asap" | "akamai";

export interface Auth {
  type: AuthType;
  [method: string]: AuthAttribute[] | AuthType | undefined;
}

export interface FormParam {
  key: string;
  value?: string;
  src?: string | string[] | null;
  disabled?: boolean;
  type?: "text" | "file";
  contentType?: string;
  description?: Description;
}

export interface Body {
  mode?: "raw" | "urlencoded" | "formdata" | "file" | "graphql";
  raw?: string;
  graphql?: { query?: string; variables?: string };
  urlencoded?: { key: string; value?: string; disabled?: boolean; description?: Description }[];
  formdata?: FormParam[];
  file?: { src?: string | null; content?: string };
  options?: { raw?: { language?: string } } & Record<string, unknown>;
  disabled?: boolean;
}

export interface RequestObject {
  url?: Url;
  auth?: Auth | null;
  proxy?: unknown;
  certificate?: unknown;
  method?: string;
  description?: Description;
  header?: Header[] | string;
  body?: Body | null;
  [extra: string]: unknown;
}

export type Request = string | RequestObject;

export interface Script {
  id?: string;
  type?: string;
  exec?: string | string[];
  src?: Url;
  name?: string;
}

export interface Event {
  id?: string;
  listen: "prerequest" | "test" | string;
  script?: Script;
  disabled?: boolean;
}

export interface Cookie {
  domain: string;
  expires?: string | null;
  maxAge?: string;
  hostOnly?: boolean;
  httpOnly?: boolean;
  name?: string;
  path: string;
  secure?: boolean;
  session?: boolean;
  value?: string;
  extensions?: unknown[];
}

export interface Response {
  id?: string;
  name?: string;
  originalRequest?: Request;
  responseTime?: number | string | null;
  timings?: Record<string, unknown> | null;
  header?: Header[] | string | null;
  cookie?: Cookie[];
  body?: string | null;
  status?: string;
  code?: number;
  _postman_previewlanguage?: string;
  [extra: string]: unknown;
}

export interface Item {
  id?: string;
  name?: string;
  description?: Description;
  variable?: Variable[];
  event?: Event[];
  request: Request;
  response?: Response[];
  protocolProfileBehavior?: Record<string, unknown>;
  [extra: string]: unknown;
}

export interface ItemGroup {
  name?: string;
  description?: Description;
  variable?: Variable[];
  item: (Item | ItemGroup)[];
  event?: Event[];
  auth?: Auth | null;
  protocolProfileBehavior?: Record<string, unknown>;
  [extra: string]: unknown;
}

export interface Collection {
  info: Info;
  item: (Item | ItemGroup)[];
  event?: Event[];
  variable?: Variable[];
  auth?: Auth | null;
  protocolProfileBehavior?: Record<string, unknown>;
  [extra: string]: unknown;
}

/** Postman environment / globals export file. */
export interface EnvironmentFile {
  id?: string;
  name?: string;
  values: { key: string; value: unknown; type?: string; enabled?: boolean }[];
  _postman_variable_scope?: "environment" | "globals";
  _postman_exported_at?: string;
  _postman_exported_using?: string;
  [extra: string]: unknown;
}

export const isItemGroup = (x: Item | ItemGroup): x is ItemGroup => Array.isArray((x as ItemGroup).item);
