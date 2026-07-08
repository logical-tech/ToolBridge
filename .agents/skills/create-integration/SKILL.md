---
name: create-integration
description: Use when adding a new toolkit/integration to Tool Bridge for a given service or topic (e.g. "add Notion", "integrate Stripe", "create a Linear integration"). Covers the defineToolkit pattern, auth strategy choice, ctx.fetch, the essential/default tool set, the brand icon, registration, optional full-API generation from OpenAPI/discovery, and how to verify. TRIGGER when the user wants a new integration, connector, or toolkit for an external API.
---

# Create a Tool Bridge integration

An integration = **one toolkit file + one registry line + one icon line**. The framework
(`ctx.fetch`, OAuth/refresh, execution, dashboard) already handles everything else. Match the
existing toolkits — read `packages/toolkits/src/{slack,gmail,google-drive}/index.ts` first;
Slack is the smallest complete example, Gmail shows OAuth+custom bodies, Drive shows the
generated long-tail.

## The three edits

1. **`packages/toolkits/src/<slug>/index.ts`** — the toolkit (see template below).
2. **`packages/toolkits/src/registry.ts`** — `import` it + add `[x.slug]: x` (keep the list alphabetical).
3. **`apps/web/src/components/toolkit-icon.tsx`** — add `<slug>: BrandIcon` to the `ICONS` map.

Nothing else. No new endpoint, no DB change, no dashboard code — the catalog, connect flow, and
execute route are generic over the registry.

## Toolkit template

```ts
import { z } from "zod"
import { defineTool, defineToolkit, oauth2 } from "../core/index"

export default defineToolkit({
  slug: "acme",                 // kebab-case; also the icon key + URL segment
  name: "Acme",
  auth: oauth2({                // pick ONE strategy — see below
    authorizationUrl: "https://acme.com/oauth/authorize",
    tokenUrl: "https://acme.com/oauth/token",
    scopes: ["read", "write"],
  }),
  baseUrl: "https://api.acme.com/v1",
  usage: `Short markdown guidance for the LLM: when to use each tool, quirks, id formats.`,
  tools: [
    defineTool({
      slug: "list_things",
      description: "List things",
      input: z.object({ limit: z.number().int().min(1).max(100).optional() }),
      execute: (input, ctx) => ctx.fetch(`/things?limit=${input.limit ?? 20}`),
    }),
    defineTool({
      slug: "create_thing",
      description: "Create a thing",
      input: z.object({ name: z.string(), body: z.string().optional() }),
      execute: (input, ctx) =>
        ctx.fetch("/things", { method: "POST", body: { name: input.name, body: input.body } }),
    }),
  ],
})
```

Zod is the single source of truth: validation + TS types + JSON Schema for the LLM. Write **10–15
ergonomic, well-described tools** (the essential set) — not the whole API. Full coverage comes from
generation (below).

## Auth strategy (`packages/toolkits/src/core/index.ts`)

- `oauth2({ authorizationUrl, tokenUrl, scopes?, authorizeParams? })` — 90% of services. Refresh is
  centralized; tools never see tokens.
  - **Refresh tokens**: some providers only return one with extra authorize params. Google needs
    `authorizeParams: { access_type: "offline", prompt: "consent" }` — without it the connection
    dies after ~1h.
  - **Shared OAuth client**: set `authProvider: "acme"` on toolkits that share one OAuth app (like
    all Google apps). The user sets client id/secret once; connecting the others is just an
    authorize click. The connection-start endpoint reuses any auth_config with the same provider.
- `apiKey({ in: "header" | "query", name, template? })` — `template` like `"Bearer {key}"`. Saved
  immediately, status active, no OAuth round-trip.
- `basic()` — HTTP Basic (username/password).

## ctx.fetch rules

- Path is relative to `baseUrl` (`ctx.fetch("/things")`) **or** an absolute `https://…` URL (for a
  different host, e.g. an upload endpoint).
- `body` as an **object** → JSON-encoded, `Content-Type: application/json`. `body` as a **string**
  → sent as-is (set your own `Content-Type` in `headers`, e.g. multipart).
- Query params: put them in the path string yourself (`new URLSearchParams`).
- Returns parsed JSON (or text). Non-2xx throws `HttpError(status, body)` — the execute route logs
  and surfaces it. Don't try/catch in the tool.

## Essential set vs full coverage

- Hand-written tools are `default: true` → the **essential set** exposed to LLMs by default.
- For full API parity, **generate** the long tail (marked `default: false`) instead of hand-writing
  hundreds of tools:
  - **OpenAPI spec** → mirror `scripts/gen-github.mjs` (emits `httpTool` per operation).
  - **Google-style discovery doc** → mirror `scripts/gen-google.mjs`.
  - Both write `src/<slug>/generated/*.ts` exporting `generatedTools`; the toolkit spreads them:
    `tools: [ ...curated, ...generatedTools ]`. Commit the output (tree-shakeable, reviewable).
- If a toolkit marks no tool `default`, all its tools are essential (backward compatible).

## Brand icon

`apps/web/src/components/toolkit-icon.tsx`: import from `react-icons/si` (Simple Icons) and map
`<slug>: SiAcme`. If Simple Icons lacks the brand (Slack was removed), fall back to
`react-icons/fa6` (`FaSlack`). Unknown slugs render the name's initial.

## Non-trivial logic → one self-check

Any tool with real logic (encoding, MIME, multipart, a parser) gets ONE runnable check via
`if (import.meta.main)` with `console.assert` (see the Gmail MIME / Drive multipart checks). Run it
with `bun packages/toolkits/src/<slug>/index.ts`.

## Verify

```bash
bun run --cwd packages/toolkits typecheck
bun run --cwd apps/api typecheck
bun run --cwd apps/web typecheck
bun packages/toolkits/src/<slug>/index.ts      # if it has a self-check
```
Then confirm it loads: `bun -e 'import {toolkits} from "./packages/toolkits/src/registry"; console.log(toolkits["<slug>"].tools.length)'`.

Typecheck ≠ real API. The HTTP paths/params are unverified until run against a live token — say so.

## Gotchas from existing integrations

- **DB**: no migration needed for a toolkit. If you *do* change `apps/api/src/db/schema.ts`, run
  `bun run --cwd apps/api db:generate` — migrations auto-apply at API startup (`src/db/sync.ts`).
- **User setup** for OAuth: the user creates the provider's OAuth client and registers the redirect
  URI `${BETTER_AUTH_URL}/api/connections/callback/<slug>` (default `http://localhost:3000/...`).
- Slack returns HTTP 200 with `{ok:false}` on logical errors — note it in `usage`.
```
