import { z } from "zod"

// ── Auth strategies ───────────────────────────────────────────────────
// Three cover ~all HTTP services. OAuth2 is authorize→callback→token→refresh
// handled centrally by the API; toolkits only declare the endpoints.

export type OAuth2Auth = {
  type: "oauth2"
  authorizationUrl: string
  tokenUrl: string
  scopes?: string[]
  /** Extra query params on the authorize URL. Google needs
   * `access_type=offline` + `prompt=consent` to return a refresh_token. */
  authorizeParams?: Record<string, string>
}

export type ApiKeyAuth = {
  type: "apiKey"
  in: "header" | "query"
  /** header/query param name, e.g. "Authorization" or "api_key" */
  name: string
  /** optional value template, `{key}` is replaced. Default: the raw key. */
  template?: string
}

export type BasicAuth = { type: "basic" }

/** GitHub App: JWT (signed with the app private key) → installation access token.
 * appId + private key live on the auth_config; installationId on the connection. */
export type GitHubAppAuth = { type: "githubApp" }

export type AuthStrategy = OAuth2Auth | ApiKeyAuth | BasicAuth | GitHubAppAuth

export const oauth2 = (o: Omit<OAuth2Auth, "type">): OAuth2Auth => ({
  type: "oauth2",
  ...o,
})

export const apiKey = (o: Omit<ApiKeyAuth, "type">): ApiKeyAuth => ({
  type: "apiKey",
  ...o,
})

export const basic = (): BasicAuth => ({ type: "basic" })

export const githubApp = (): GitHubAppAuth => ({ type: "githubApp" })

// ── Tool execution context ────────────────────────────────────────────
// ctx.fetch injects credentials + baseUrl. Tools never see tokens/refresh.

export type FetchInit = Omit<RequestInit, "body"> & { body?: unknown }

export interface ToolContext {
  /** Fetch relative to the toolkit baseUrl with credentials injected. */
  fetch: (path: string, init?: FetchInit) => Promise<unknown>
}

// ── Definitions ───────────────────────────────────────────────────────

export type ParseResult =
  | { ok: true; data: unknown }
  | { ok: false; issues: unknown }

// Unified tool shape. Both hand-written (Zod) and generated (raw JSON Schema)
// tools normalize to this: a JSON Schema for the LLM, a parse fn, and execute.
export interface ToolDef {
  slug: string
  description: string
  jsonSchema: object
  /** Part of the toolkit's essential set — exposed to LLMs by default. Generated
   * long-tail tools set this false so the default surface stays small. When a
   * toolkit marks none, all its tools are treated as essential. */
  default?: boolean
  parse: (input: unknown) => ParseResult
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (input: any, ctx: ToolContext) => Promise<unknown>
}

// ── Webhooks / triggers ───────────────────────────────────────────────
// Declares how the API verifies an incoming webhook and names its event.
// The signature is HMAC-SHA256(secret, rawBody) — GitHub's scheme.
// ponytail: covers GitHub. Providers with a different scheme (Slack's
// timestamped basestring) need a `verify` fn here instead of this shape.

export interface WebhookDef {
  /** Header carrying `<prefix><hex>`, e.g. "x-hub-signature-256". */
  signatureHeader: string
  /** Prefix stripped before comparing, e.g. "sha256=". */
  signaturePrefix?: string
  /** Header naming the event, e.g. "x-github-event". */
  eventHeader?: string
}

export interface ToolkitDef {
  slug: string
  name: string
  auth: AuthStrategy
  /** Toolkits sharing a provider (e.g. all Google apps) share one OAuth client:
   * set the client id/secret once, then connecting the others is just an
   * authorize click. Connection start accepts an auth_config from any toolkit
   * with the same provider. */
  authProvider?: string
  /** Extra connection strategies the toolkit also supports (e.g. GitHub App
   * alongside OAuth). The catalog advertises these; `auth` stays the primary. */
  altAuth?: AuthStrategy[]
  baseUrl: string
  tools: ToolDef[]
  webhooks?: WebhookDef
  /** Guidance for an LLM on when/how to use this toolkit's tools (markdown-ish). */
  usage?: string
}

/** Author a tool with a Zod input schema (types + validation + JSON Schema for free). */
export function defineTool<I extends z.ZodType>(def: {
  slug: string
  description: string
  input: I
  /** Defaults to true — hand-written tools are the ergonomic essential set. */
  default?: boolean
  execute: (input: z.infer<I>, ctx: ToolContext) => Promise<unknown>
}): ToolDef {
  return {
    slug: def.slug,
    description: def.description,
    jsonSchema: z.toJSONSchema(def.input) as object,
    default: def.default ?? true,
    parse: (input) => {
      const r = def.input.safeParse(input)
      return r.success
        ? { ok: true, data: r.data }
        : { ok: false, issues: r.error.issues }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: def.execute as (input: any, ctx: ToolContext) => Promise<unknown>,
  }
}

// ── Generated HTTP tools ──────────────────────────────────────────────
// A declarative tool: the generator supplies method/path/param roles + a JSON
// Schema (from an OpenAPI operation); this factory does the HTTP mechanics.
// Path params are substituted, query params appended, everything else is the body.

export interface HttpToolSpec {
  slug: string
  description: string
  method: string
  path: string
  pathParams: string[]
  queryParams: string[]
  jsonSchema: object
  /** Generated long-tail tools default to false (opt-in, not in the essential set). */
  default?: boolean
}

export function httpTool(spec: HttpToolSpec): ToolDef {
  const method = spec.method.toUpperCase()
  const used = new Set([...spec.pathParams, ...spec.queryParams])
  return {
    slug: spec.slug,
    description: spec.description,
    jsonSchema: spec.jsonSchema,
    default: spec.default ?? false,
    parse: (input) => {
      const obj = (input ?? {}) as Record<string, unknown>
      // Only path params are structurally required (missing → malformed URL).
      // Everything else is validated by GitHub, which surfaces a clear error.
      const missing = spec.pathParams.filter(
        (p) => obj[p] === undefined || obj[p] === null || obj[p] === ""
      )
      return missing.length
        ? { ok: false, issues: missing.map((p) => ({ path: [p], message: `required path parameter "${p}"` })) }
        : { ok: true, data: obj }
    },
    execute: (input, ctx) => {
      const obj = (input ?? {}) as Record<string, unknown>
      let path = spec.path
      for (const name of spec.pathParams)
        path = path.replace(`{${name}}`, encodeURIComponent(String(obj[name])))
      const query = new URLSearchParams()
      for (const name of spec.queryParams) {
        const v = obj[name]
        if (v !== undefined && v !== null)
          query.set(name, Array.isArray(v) ? v.join(",") : String(v))
      }
      const bodyEntries = Object.entries(obj).filter(
        ([k, v]) => !used.has(k) && v !== undefined
      )
      const hasBody = method !== "GET" && method !== "HEAD" && bodyEntries.length > 0
      const qs = query.toString()
      return ctx.fetch(`${path}${qs ? `?${qs}` : ""}`, {
        method,
        body: hasBody ? Object.fromEntries(bodyEntries) : undefined,
      })
    },
  }
}

export function defineToolkit(def: ToolkitDef): ToolkitDef {
  return def
}
