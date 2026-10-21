import type { Auth } from "@postbench/core";

export interface HeaderEntry {
  key: string;
  value: string;
}

export type PreparedBody =
  | { kind: "none" }
  | { kind: "text"; text: string }
  | { kind: "urlencoded"; text: string }
  | { kind: "formdata"; parts: FormPart[] }
  | { kind: "file"; src?: string; content?: string };

export interface FormPart {
  name: string;
  value?: string;
  src?: string;
  contentType?: string;
}

/** A fully resolved request, ready to be put on the wire. */
export interface PreparedRequest {
  method: string;
  url: string;
  headers: HeaderEntry[];
  body: PreparedBody;
  /** Resolved auth (variables substituted), applied at send time. */
  auth?: Auth | null;
}

export interface ProtocolProfileBehavior {
  followRedirects?: boolean;
  followOriginalHttpMethod?: boolean;
  followAuthorizationHeader?: boolean;
  maxRedirects?: number;
  strictSSL?: boolean;
  disableBodyPruning?: boolean;
  disableUrlEncoding?: boolean;
  disableCookies?: boolean;
  insecureHTTPParser?: boolean;
  removeRefererHeaderOnRedirect?: boolean;
  [k: string]: unknown;
}

export interface Timings {
  /** Milliseconds from start for each phase boundary. */
  socket?: number;
  lookup?: number;
  connect?: number;
  secureConnect?: number;
  response?: number;
  end: number;
}

export interface TimingPhases {
  wait: number;
  dns: number;
  tcp: number;
  secureHandshake: number;
  firstByte: number;
  download: number;
  total: number;
}

export interface ResponseData {
  code: number;
  status: string;
  headers: HeaderEntry[];
  body: Uint8Array;
  responseTime: number;
  responseSize: number;
  timings: TimingPhases;
  /** URL of the final response after redirects. */
  url: string;
  redirects: { url: string; code: number }[];
  cookies: { name: string; value: string; domain?: string; path?: string; expires?: string; httpOnly?: boolean; secure?: boolean }[];
}
