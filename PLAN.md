# Tool Bridge — Piano di architettura

Tool Bridge è il punto centrale per l'intelligenza artificiale: un Composio open source.
API in Bun + Hono, autenticazione con Better Auth.

## Stato attuale

Monorepo Turborepo/Bun con `apps/web` (Vite + React 19 + shadcn completo) e `packages/ui`.
Nessuna API, nessun DB, nessuna auth: il backend parte da zero.

## Cosa fa Composio, ridotto all'osso

Quattro concetti; tutto il resto (dashboard, SDK, MCP) è interfaccia sopra questi:

1. **Toolkit** — un'integrazione (GitHub, Slack, Gmail…): definizione dell'auth + lista di tool
2. **Auth Config** — le credenziali OAuth *dell'app* per un toolkit (client id/secret) o schema API-key
3. **Connected Account** — la connessione *di un utente* a un toolkit (token, refresh, stato)
4. **Tool** — un'azione con schema input JSON, eseguita iniettando le credenziali del connected account

## Struttura monorepo

```
apps/
  web/          # esiste già → diventa la dashboard
  api/          # NUOVO: Bun + Hono
packages/
  ui/           # esiste già
  toolkits/     # NUOVO: il cuore — tutte le integrazioni
```

**Stack API**: Bun + Hono + **Postgres + Drizzle** + **Better Auth** con plugin `apiKey`
(per chiamate programmatiche) e `organization` (multi-tenant, se serve subito).
Better Auth ha adapter Drizzle nativo — zero colla da scrivere.

## La decisione chiave: come si scrive un'integrazione

La manutenibilità vive tutta qui. Un toolkit = un file TypeScript dichiarativo:

```ts
// packages/toolkits/src/github/index.ts
export default defineToolkit({
  slug: "github",
  auth: oauth2({
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo", "user"],
  }),
  baseUrl: "https://api.github.com",
  tools: [
    defineTool({
      slug: "create_issue",
      description: "Create an issue in a repository",
      input: z.object({
        owner: z.string(),
        repo: z.string(),
        title: z.string(),
        body: z.string().optional(),
      }),
      execute: (input, ctx) =>
        ctx.fetch(`/repos/${input.owner}/${input.repo}/issues`, {
          method: "POST",
          body: { title: input.title, body: input.body },
        }),
    }),
  ],
})
```

Tre proprietà che rendono il sistema mantenibile:

- **`ctx.fetch` inietta le credenziali** — il tool non sa nulla di token, refresh, header.
  Refresh OAuth centralizzato in un solo posto, non replicato in 50 integrazioni.
- **Zod come unica fonte di verità** — validazione runtime + tipi TS + `z.toJSONSchema()`
  per esporre i tool a LLM/MCP. Uno schema, tre usi.
- **Registry statico** — `export const toolkits = { github, slack, ... }`. Niente plugin
  dinamici, niente marketplace: aggiungere un'integrazione = aggiungere un file e una riga.
  Import statico, tree-shakeable, type-safe.

Le strategie auth sono 3 e bastano: `oauth2()` (copre il 90% dei servizi), `apiKey()`
(header/query), `basic()`. OAuth2 generico gestisce authorize → callback → token → refresh
una volta sola per tutti i toolkit.

## Modello dati (oltre alle tabelle Better Auth)

```
auth_config        (id, toolkit_slug, client_id, client_secret_encrypted, scopes, owner)
connected_account  (id, user_id, auth_config_id, toolkit_slug,
                    credentials_encrypted, status, expires_at)
tool_execution     (id, connected_account_id, tool_slug, input, output, status, duration, created_at)
```

Credenziali cifrate AES-256-GCM con master key da env (`crypto.subtle`, built-in di Bun —
niente dipendenze).

## API surface (minima ma completa)

```
GET  /api/toolkits                          # catalogo
GET  /api/toolkits/:slug/tools              # tool con JSON Schema
POST /api/connections                       # avvia flow → { redirectUrl } o salva api-key
GET  /api/connections/callback/:slug        # OAuth callback (uno, generico)
GET  /api/connections                       # le connessioni dell'utente
POST /api/tools/:toolkit/:tool/execute      # { connectedAccountId, arguments }
```

Auth: sessione Better Auth per la dashboard, API key per l'uso da codice/agenti.

## Fasi

1. **Scaffold** — `apps/api` (Hono), Drizzle + Postgres, Better Auth con apiKey plugin.
   Endpoint `/health` + auth funzionante.
2. **Core framework** — `defineToolkit`/`defineTool`, registry, endpoint catalogo.
3. **Connessioni** — flow OAuth2 generico + api-key, cifratura, refresh token.
4. **Esecuzione** — endpoint execute con validazione Zod, injection credenziali,
   log in `tool_execution`.
5. **2 toolkit reali** (GitHub + Slack) — validano il framework; se scriverli è doloroso,
   si aggiusta il framework *ora*, prima di averne 30.
6. **Dashboard** — catalogo, connetti account, log esecuzioni (shadcn già pronto).
7. **Dopo, solo se serve**: server MCP che espone i tool (con Zod è quasi gratis),
   triggers/webhook, SDK npm, toolkit generati da spec OpenAPI.

## Cosa NON costruire in v1

- **Triggers/webhook** — metà della complessità di Composio per una feature che
  l'esecuzione tool non richiede. Dopo.
- **Plugin system dinamico** — i toolkit sono file nel repo. Un PR è il "marketplace".
- **Coda di esecuzione** — i tool sono chiamate HTTP dirette; una coda si aggiunge
  quando ci sono rate limit reali da gestire.
- **Generazione da OpenAPI** — prima si scrivono 5 toolkit a mano per capire quale
  astrazione serve davvero.

## Decisioni aperte

- **Postgres dove?** Locale/Docker per dev; provider (Neon/Supabase/…) da decidere.

---

## Stato implementazione (aggiornato)

### ✅ Fase 1 — Scaffold (fatta, verificata)
- `docker-compose.yml`: Postgres 17 locale (`docker compose up -d`), volume `toolbridge-pgdata`.
- `apps/api`: Bun + Hono. Entry `src/index.ts` → `export default { port, fetch }`.
- DB: Drizzle su **Bun SQL nativo** (`drizzle-orm/bun-sql`, zero driver a runtime).
  `postgres` è devDependency solo perché drizzle-kit non parla bun-sql.
- `src/db/schema.ts`: tabelle Better Auth (`user/session/account/verification/apikey`)
  + domain (`auth_config`, `connected_account`, `tool_execution`). Applicate con `bun db:push`.
- `src/auth.ts`: Better Auth, email/password + plugin apiKey, drizzleAdapter(pg).
- Endpoint attivi: `GET /health`, `/api/auth/*` (signup/login/apikey).
- ⚠️ **Gotcha**: in Better Auth ≥1.6 il plugin apiKey è in `@better-auth/api-key`,
  NON più in `better-auth/plugins`.
- Setup: `cd apps/api && cp .env.example .env && bun run dev`.

### ✅ Fase 2 — Core framework (fatta, verificata)
- `packages/toolkits`: `defineToolkit`/`defineTool` + `oauth2()`/`apiKey()`/`basic()` in
  `src/core/index.ts`. `ToolContext.fetch(path, {body})` è il punto d'iniezione credenziali.
- Registry statico `src/registry.ts` (`{ [slug]: toolkit }`). Helper in `src/index.ts`:
  `listToolkits`, `getToolkit`, `getTool`, `toolToJSON` (Zod → `z.toJSONSchema`).
- Toolkit GitHub reale (`src/github/index.ts`, 2 tool) come prova del framework.
- Endpoint: `GET /api/toolkits`, `GET /api/toolkits/:slug/tools` (`apps/api/src/routes/toolkits.ts`).

### ✅ Fase 3 — Connessioni (fatta, typecheck + self-check OK)
Implementato: `crypto.ts` (AES-256-GCM + state HMAC firmato, nessuna colonna/tabella extra),
`credentials.ts` (`getValidCredentials` con refresh OAuth centralizzato + `oauthTokenRequest`),
`session.ts` (`getUserId` via `auth.api.getSession`), route `auth-configs.ts` e `connections.ts`
(POST start oauth2/apiKey/basic, GET callback generico firmato, GET list). Agganciate in `index.ts`.
Prossimo step: **Fase 5 — Slack + hardening**.

Piano originale:
Obiettivo: OAuth2 generico + api-key, con cifratura credenziali.
1. **Crypto** `apps/api/src/crypto.ts`: AES-256-GCM via `crypto.subtle` (built-in Bun).
   Chiave da `ENCRYPTION_KEY` (base64, 32 byte). `encrypt(plaintext)→string`,
   `decrypt(string)→plaintext`. Formato consigliato: `base64(iv).base64(ciphertext+tag)`.
   Lasciare un self-check `if (import.meta.main)` round-trip.
2. **Auth config**: endpoint per salvare client_id/secret OAuth *dell'app* per toolkit
   (`POST /api/auth-configs`), secret cifrato con la crypto sopra. Serve alla dashboard.
3. **Avvio connessione** `POST /api/connections`:
   - oauth2 → costruisci authorize URL (client_id, redirect_uri, scope, `state` firmato/random
     salvato per validare il callback), crea `connected_account` status `pending`, ritorna `{redirectUrl}`.
   - apiKey/basic → salva subito le credenziali cifrate, status `active`.
4. **Callback generico** `GET /api/connections/callback/:slug`: valida `state`, scambia `code`
   → token sul `tokenUrl` del toolkit, cifra `{access_token, refresh_token, expires_at}` in
   `connected_account.credentials_encrypted`, status `active`.
5. **Refresh**: funzione centrale `getValidCredentials(connectedAccountId)` che rinfresca se scaduto
   (usa `tokenUrl` + refresh_token) e riscrive cifrato. Un solo posto, usato da ctx.fetch.
6. `GET /api/connections`: lista connessioni dell'utente (senza credenziali).
   - Decisione aperta: `redirect_uri` base = `${BETTER_AUTH_URL}/api/connections/callback/:slug`.

### ✅ Fase 4 — Esecuzione (fatta, typecheck OK)
`execute.ts`: `makeContext(toolkit, creds)` costruisce `ctx.fetch` che prepende `baseUrl`,
inietta l'auth (Bearer / header|query api-key con `{key}` template / Basic), forza User-Agent
+ Accept, serializza il body JSON, e lancia `HttpError(status, body)` sui non-2xx.
`routes/tools.ts`: `POST /api/tools/:toolkit/:tool/execute` — auth via `getUserId`
(sessione cookie **o** `x-api-key` gestito dal plugin better-auth), `tool.input.safeParse`
(400 sugli issue), risoluzione connected account (id esplicito o l'unico attivo del toolkit),
`getValidCredentials` → `tool.execute`, log in `tool_execution` (input/output/status/durationMs).
Body accetta `arguments` o `input`.

Piano originale:

### ⬜ ~~Fase 4 — Esecuzione~~
`POST /api/tools/:toolkit/:tool/execute` body `{connectedAccountId, arguments}`:
1. `getTool(toolkit, tool)`; valida `arguments` con `tool.input.parse` (400 se fallisce).
2. Costruisci `ctx.fetch`: prepende `toolkit.baseUrl`, inietta credenziali secondo `toolkit.auth.type`
   (oauth2 → `Authorization: Bearer`, apiKey → header/query, basic → Basic), serializza `body` JSON,
   `refresh` via `getValidCredentials`. Vive accanto al framework (o in `apps/api/src/execute.ts`).
3. Esegui `tool.execute(args, ctx)`, misura durata, scrivi riga in `tool_execution`
   (status success/error, input/output/durationMs). Ritorna l'output.
- Auth di questi endpoint: sessione Better Auth (dashboard) **o** API key (agenti).
  Middleware Hono che risolve l'utente da `auth.api.getSession` o da header `x-api-key`.

### ✅ Fase 5 — Slack + hardening (fatta)
`packages/toolkits/src/slack/index.ts` (oauth2, `send_message` + `list_channels`), registrato.
Scriverlo **non ha fatto attrito**: nessuna modifica a `defineToolkit`/`ctx` necessaria →
il framework è validato. Skip hardening (baseUrl per-tool, content-type, paginazione): YAGNI
finché un toolkit reale non lo impone.
Nota nota: Slack risponde 200 con `{ok:false}` sugli errori logici → l'esecuzione viene
loggata "success" anche se Slack rifiuta. Fix (check `ok` per-tool) solo se dà fastidio.

### ✅ Fase 6 — Dashboard (fatta, typecheck OK)
`apps/web`: client Better Auth (`lib/auth-client.ts`) + fetch wrapper (`lib/api.ts`).
Gate auth in `App.tsx` (`useSession`), tabs Catalog/Connections/Logs. Componenti:
`auth-form` (signup/login email+password), `catalog` (lista toolkit + form connetti →
crea auth-config + avvia OAuth/redirect o salva api-key), `connections` (tabella + stato),
`logs` (tabella esecuzioni via nuovo `GET /api/executions`). CORS+cookie già a posto.

Verificato end-to-end via curl: signup→cookie, auth-config (secret cifrato), start OAuth
(authorize URL + state firmato + connessione `pending`), execute (400 su input invalido,
404 tool ignoto, "no connected account" se nessun account attivo), callback rifiuta state manomesso.

### 🟡 Fase 7 — Dopo, solo se serve
- ✅ **Triggers/webhook** (fatti). `WebhookDef` dichiarativo su `ToolkitDef` (header firma,
  prefix, header evento) — GitHub lo dichiara. `POST /api/webhooks/:slug/:authConfigId`:
  nessuna sessione, autenticità = **HMAC-SHA256** (`verifyHmacSha256` constant-time in
  `crypto.ts`, con known-vector GitHub nel self-check), secret webhook cifrato per auth-config,
  evento salvato in `trigger_event`. Consumo: `GET /api/triggers/events`. UI: tab Triggers +
  campo webhook secret nel form. Verificato e2e (204 firma valida, 401 errata/mancante, 404 config).
  URL webhook: `${BETTER_AUTH_URL}/api/webhooks/github/<authConfigId>` (in dev serve un tunnel:
  GitHub non raggiunge localhost). ponytail: schema firma copre GitHub; Slack (basestring con
  timestamp) richiederà una `verify` fn nel `WebhookDef` invece dei campi dichiarativi.
- ⬜ MCP server sui tool (con Zod quasi gratis), SDK npm, gen da OpenAPI.

### Comandi utili
```
docker compose up -d                       # postgres
cd apps/api && bun db:push                  # applica schema
cd apps/api && bun run dev                  # API su :3000
cd apps/api && bun run typecheck            # tsc
```
