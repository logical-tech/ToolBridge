import type {
  AuthStrategy,
  FetchInit,
  ToolContext,
  ToolkitDef,
} from "@workspace/toolkits"
import type { Credentials } from "./credentials"

/** Non-2xx response from a toolkit — carries status + parsed body for logging. */
export class HttpError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super(`upstream ${status}`)
  }
}

function applyAuth(
  auth: AuthStrategy,
  creds: Credentials,
  url: URL,
  headers: Headers
): void {
  if (creds.type === "oauth2") {
    headers.set("Authorization", `Bearer ${creds.accessToken}`)
  } else if (creds.type === "githubApp") {
    // token is guaranteed fresh by getValidCredentials
    headers.set("Authorization", `Bearer ${creds.token}`)
  } else if (auth.type === "apiKey" && creds.type === "apiKey") {
    const value = auth.template
      ? auth.template.replace("{key}", creds.apiKey)
      : creds.apiKey
    if (auth.in === "header") headers.set(auth.name, value)
    else url.searchParams.set(auth.name, value)
  } else if (auth.type === "basic" && creds.type === "basic") {
    const b64 = Buffer.from(`${creds.username}:${creds.password}`).toString("base64")
    headers.set("Authorization", `Basic ${b64}`)
  } else {
    throw new Error(`credentials do not match toolkit auth type "${auth.type}"`)
  }
}

/** ToolContext whose fetch injects baseUrl + credentials. Tools stay auth-agnostic. */
export function makeContext(toolkit: ToolkitDef, creds: Credentials): ToolContext {
  return {
    fetch: async (path: string, init: FetchInit = {}) => {
      // Absolute URLs pass through (e.g. Google's separate upload host);
      // relative paths hang off the toolkit baseUrl.
      const url = /^https?:\/\//.test(path) ? new URL(path) : new URL(toolkit.baseUrl + path)
      const headers = new Headers(init.headers as HeadersInit)
      applyAuth(toolkit.auth, creds, url, headers)
      // Many APIs (e.g. GitHub) reject requests without a User-Agent.
      if (!headers.has("User-Agent")) headers.set("User-Agent", "ToolBridge")
      if (!headers.has("Accept")) headers.set("Accept", "application/json")

      const { body, ...rest } = init
      let outBody: BodyInit | undefined
      if (body !== undefined) {
        // Pre-encoded string bodies (e.g. multipart upload) pass through as-is;
        // objects are JSON. Tools set Content-Type themselves for non-JSON bodies.
        outBody = typeof body === "string" ? body : JSON.stringify(body)
        if (!headers.has("Content-Type") && typeof body !== "string")
          headers.set("Content-Type", "application/json")
      }

      const res = await fetch(url, { ...(rest as RequestInit), headers, body: outBody })
      const text = await res.text()
      const data = text ? safeJson(text) : null
      if (!res.ok) throw new HttpError(res.status, data)
      return data
    },
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
