# GitHub Toolkit — analisi e piano "un tool per ogni azione"

## TL;DR
- Un tool per ogni azione GitHub = **~1000 operazioni REST**. Non si scrivono a mano:
  si **generano** dalla spec OpenAPI ufficiale (`github/rest-api-description`), filtrando
  le operazioni con `x-github.enabledForGitHubApps: true`.
- **Il toolkit attuale è una OAuth App, non una GitHub App.** Auth diversa (JWT→installation
  token) e set di permessi diverso. Questa è la prima decisione da prendere.
- Ordine consigliato: (1) sistemare l'auth GitHub App, (2) scrivere il generatore, (3)
  generare un subset curato ~40 tool per validarlo, (4) generare il resto.

---

## 1. OAuth App vs GitHub App — la differenza conta

Oggi `packages/toolkits/src/github/index.ts` usa `oauth2()`:
`github.com/login/oauth/authorize` → user access token. Questa è una **OAuth App**.

Una **GitHub App** è un'altra cosa:

| | OAuth App (ora) | GitHub App |
|---|---|---|
| Identità | agisce come l'utente | agisce come l'app (installation) o on-behalf-of-user |
| Auth | user token da OAuth code flow | **JWT RS256** firmato con private key → scambiato per **installation access token** (scade 1h) |
| Permessi | scopes larghi (`repo`, `read:user`) | **fine-grained** per-permesso read/write, per-installazione |
| Rate limit | 5k/h per utente | 5k/h+ per installazione, scala con la size dell'org |
| Webhook | limitati | per-app, ricchi (già abbiamo il receiver) |
| Revoca | per-utente | disinstalla l'app |

**"Azioni permesse dalla GitHub App" = le operazioni coperte dai permessi che l'app
richiede in fase di registrazione**, ristrette all'installazione. Quindi il set di tool
"permessi" non è statico: dipende dai permessi concessi.

### Cosa cambia nel framework (auth)
`oauth2()` e `getValidCredentials` non gestiscono il flow GitHub App. Serve una nuova
strategia. Bozza:

```ts
// packages/toolkits/src/core → nuova AuthStrategy
export type GitHubAppAuth = {
  type: "githubApp"
  appId: string            // dall'auth_config
  // privateKey (PEM) e installationId stanno cifrati nel connected_account
}
```

Flow lato API (`credentials.ts`):
1. `jwt = RS256({ iss: appId, iat, exp:+9min }, privateKey)` — firma con
   `crypto.subtle.importKey("pkcs8", ...)` + `sign("RSASSA-PKCS1-v1_5")` (built-in Bun, zero dep).
2. `POST /app/installations/:id/access_tokens` con `Bearer <jwt>` → `{ token, expires_at, permissions }`.
3. Cache del token per installazione fino a `expires_at - 60s` (stesso pattern di refresh oauth).
4. `ctx.fetch` usa `Bearer <installationToken>`.

`connected_account` per una GitHub App = un'**installazione** (non un OAuth grant). Il modello
dati regge: `credentials_encrypted` contiene `{ installationId, ... }`, `auth_config` contiene
`appId` + `privateKey` cifrata. La colonna `webhook_secret_encrypted` c'è già.

> **Deciso**: le due strategie **coesistono**. `githubApp()` si aggiunge accanto a `oauth2()`,
> stessi tool, l'utente sceglie come connettersi (come Composio). `connected_account` porta il
> tipo di credenziale, `ctx.fetch` inietta Bearer indifferentemente (user token o installation token).

---

## 2. Cosa può fare una GitHub App — tassonomia dei permessi

I permessi fine-grained sono la mappa di *tutto* ciò che si può fare. Ogni permesso
(read | write) sblocca un gruppo di endpoint. Lista (fonte: docs GitHub, luglio 2026):

**Repository-level** (i più usati per i tool):
`actions`, `administration`, `attestations`, `checks`, `code scanning alerts`,
`codespaces` (+ lifecycle/metadata/secrets), `commit statuses`, `contents`,
`custom properties`, `dependabot alerts`, `dependabot secrets`, `deployments`,
`environments`, `issues`, `metadata` (base, quasi sempre concesso), `pages`,
`pull requests`, `repository security advisories`, `secret scanning alerts`,
`secrets`, `variables`, `webhooks`, `workflows`.

**Organization-level**:
`administration`, `members`, `custom roles/properties`, `projects`, `blocking users`,
`org secrets/variables`, `org codespaces`, `dependabot secrets`, `personal access tokens`
(+ requests), `self-hosted runners`, `network configs`, `campaigns`, `copilot` (business/
metrics/settings), `issue types/fields`, `events`, `api insights`.

**Account/User-level**:
`block another user`, `email addresses`, `followers`, `gpg keys`, `ssh keys`,
`profile`, `git signing ssh keys`, `codespaces user secrets`, `starring`, `watching`, `plan`.

**Enterprise-level**: memberships/organizations (raramente serve).

→ ~40 permessi repo/org + ~12 user. Ogni endpoint dichiara il permesso richiesto nell'header
`X-Accepted-GitHub-Permissions` e nella spec OpenAPI (`x-github`).

---

## 3. La decisione di build: **generare, non scrivere a mano**

GitHub pubblica la spec OpenAPI completa e ufficiale:
`github/rest-api-description` → `descriptions/api.github.com/api.github.com.json` (bundled).

Proprietà che la rendono generabile:
- Ogni operazione ha `operationId`, `summary`, method, path, `parameters`, `requestBody`
  (già **JSON Schema**), e `x-github.enabledForGitHubApps: true|false`.
- `x-github.category` / `subcategory` → raggruppamento naturale in "toolkit" logici.
- Filtrando `enabledForGitHubApps: true` si ottiene **esattamente** l'insieme di azioni
  che una GitHub App può compiere.

**Scrivere ~1000 `defineTool` a mano è fuori discussione** (immantenibile, e la spec cambia).
Il generatore è l'unica risposta lazy-corretta — ed è già previsto nel PLAN principale
("Fase 7: toolkit generati da spec OpenAPI").

### Mappatura operazione → ToolDef
```
operationId  → tool.slug            (es. "issues/create" → "issues.create")
summary      → tool.description
category     → sotto-namespace / file
method+path  → execute: ctx.fetch(path con {param} sostituiti, { method, query, body })
parameters   → input Zod (path+query)         ┐ dalla conversione
requestBody  → input Zod (body)               ┘ JSON Schema → Zod
x-github.permissions/header → metadato per il gating (vedi Fase D)
```

### JSON Schema → Zod: due strade
- **A (consigliata)**: `json-schema-to-zod` a build-time → resta tutto uniforme (Zod →
  validazione + tipi + `z.toJSONSchema` per l'output). Una dep, solo in dev/codegen.
- **B**: i tool generati portano il JSON Schema *raw*, validati con Ajv a runtime;
  `toolToJSON` lo ritorna diretto (niente round-trip). Richiede però `ToolDef.input:
  ZodType | JsonSchema` → un branch in più ovunque. Più veloce ma meno uniforme.

Consiglio A per non toccare il resto del framework.

---

## 4. Piano a fasi

> **Scelte confermate:** (1) OAuth App + GitHub App **coesistono**; (2) si parte dal
> **subset curato ~40 tool (Fase E)**. Il subset gira già sull'`oauth2()` esistente, quindi
> Fase E e Fase A procedono in parallelo (i tool non aspettano l'auth GitHub App).

### ✅ Fase A — Auth GitHub App (fatta, verificata)
`github-app.ts`: `githubAppJwt()` firma RS256 con `node:crypto` (gestisce le chiavi **PKCS#1**
che GitHub distribuisce, senza wrapping ASN.1) + `fetchInstallationToken()`. Self-check
sign/verify con chiave generata. `credentials.ts`: variante `githubApp` in `getValidCredentials`
minta/rinfresca l'installation token (cache in `connected_account`, appId+private key da
`auth_config.clientId/clientSecret`). `execute.ts`: `applyAuth` inietta il Bearer.
`connections.ts`: `authType:"githubApp"` + `installationId` → connessione. `githubApp()` +
`altAuth` nel core; catalogo espone `authTypes`. Le due strategie coesistono.
Verificato e2e: JWT firmato → scambio token → GitHub processa (rifiuta le fake) → errore
gestito 502 (non 500). **Bugfix collaterale**: `getValidCredentials` era fuori dal try/catch
dell'execute → un mint fallito dava 500; ora è dentro, loggato come errore.

<details><summary>Piano originale Fase A</summary>
- `githubApp()` strategy nel core.
- `credentials.ts`: firma JWT RS256 (`crypto.subtle`), scambio installation token, cache
  con refresh su scadenza (riusa il pattern di `getValidCredentials`).
- `connected_account` = installazione; `auth_config` porta `appId` + private key cifrata.
- Endpoint per registrare l'installazione (callback `setup_url` / `installation_id`).
- **Check**: un tool esistente (`get_authenticated_user` → o meglio `GET /installation/repositories`)
  gira con l'installation token vero.

### ✅ Fase B — Generatore (fatta, 943 tool)
Fatto: `ToolDef` unificato (`{jsonSchema, parse, execute}`) → `defineTool` (Zod, scritti a
mano) e `httpTool` (raw, generati) producono la stessa forma. `httpTool` fa la meccanica HTTP
(sostituzione path param, query, body). `scripts/gen-github.mjs` (`bun run gen:github`):
scarica la spec (cache gitignored), filtra `enabledForGitHubApps`, risolve i `$ref`
(parametri) con cycle-guard e depth cap, unisce parametri+requestBody in un JSON Schema per
operazione, emette `src/github/generated/<category>.ts` (47 file) + `index.ts` → `generatedTools`.
`github/index.ts` monta i 943 tool (i tool a mano rimossi, superati). Output committato.
Verificato: 943 tool, schema merge corretto (issues.create → required owner/repo/title),
validazione path param (400), meccanica path/query/body (check standalone), typecheck ~1.4s.
- ponytail: validazione locale solo sui path param (gli altri li valida GitHub → errore chiaro
  via HttpError); niente Ajv. \`content\` di create-or-update-file è passato verbatim (base64,
  come da API) invece di essere codificato lato tool. Body \`oneOf\` non modellati →
  \`additionalProperties:true\` così l'LLM può passarli.

<details><summary>Piano originale Fase B</summary>

- Script `packages/toolkits/scripts/gen-github.ts`:
  1. fetch (o vendor locale, pinnato a una release) del bundled OpenAPI.
  2. filtra `enabledForGitHubApps: true`.
  3. per ogni op: costruisce path-template, separa param path/query/body, converte gli
     schema in Zod, emette un `defineTool`.
  4. raggruppa per `category` in file `src/github/generated/<category>.ts`.
  5. un `index.ts` che monta tutti i tool nel toolkit.
- Output **committato** (non generato a runtime): tree-shakeable, type-safe, reviewabile in PR.
- Pin della versione spec → i bump sono un PR esplicito (diff = cosa è cambiato in GitHub).

</details>

### Fase C — Hardening `ctx.fetch` per il caso generale
Il `ctx.fetch` attuale fa solo path + body JSON. I ~1000 endpoint richiedono:
- **path params** sostituiti (`/repos/{owner}/{repo}/issues/{issue_number}`) — lo fa l'execute generato.
- **query params** — l'execute li serializza in `?...`. `ctx.fetch` già accetta il path completo, ok.
- **paginazione** (header `Link`) — **gap reale**: le liste tornano 30/pagina. Opzioni:
  helper `ctx.paginate()` o un flag `perPage`/`page` esposto nell'input. Da decidere.
- **content-type non-JSON** (upload asset release, raw blob) — pochi endpoint, gestibili a parte.
- **rate limit / secondary limits** — retry con backoff su 403/429 + header `Retry-After`
  (già previsto "dopo" nel PLAN; qui diventa più rilevante con 1000 tool).

### Fase D — Superficie permission-aware
- Ogni tool generato porta il permesso richiesto come metadato.
- A runtime l'installation token dichiara i `permissions` concessi → esporre / eseguire solo
  i tool coperti. Evita 403 prevedibili e rende il catalogo UI onesto ("questi tool sono
  disponibili con i permessi che hai concesso").

### ✅ Fase E — Subset curato (fatta, 47 tool)
Scritto a mano in `packages/toolkits/src/github/tools/<category>.ts` (issues, pulls, repos,
actions, releases, git, search, users) + `_util.ts` (`qs`, `repoFields`, `pageFields`).
`github/index.ts` assembla tutte le category. Convenzioni fissate per il generatore:
slug `resource.verb`, path-template inline nell'execute, query via `qs()`, body come oggetto.
Verificato: `GET /api/toolkits/github/tools` → 47 tool con JSON Schema; validazione input ok;
slug con il punto routano correttamente nell'URL execute.

> **Prossimo (Fase B):** il generatore replica questa forma su tutte le operazioni
> `enabledForGitHubApps` della spec OpenAPI. Restano aperti: paginazione (header `Link`) e
> retry/backoff su rate limit — diventano rilevanti a 1000 tool.

<details><summary>Piano originale Fase E</summary>
Non generare 1000 tool al primo colpo. Generane ~40 (le category ad alto valore) per
validare generatore + auth + UI, poi apri il rubinetto.
</details>

---

## 5. Numeri di riferimento
- ~1000 operazioni REST totali; grande maggioranza con `enabledForGitHubApps: true`.
- ~40 permessi repo/org + ~12 user-level.
- ~60 category OpenAPI → ~60 file `generated/`.
- Subset Fase E: ~40 tool, ~12 category.

## 6. Cosa NON fare
- Non scrivere i tool a mano (se non i 2 di prova già presenti).
- Non generare a runtime: committa l'output.
- Non esporre tool oltre i permessi concessi.
- Non inseguire GraphQL v4 ora: REST copre le "azioni"; GraphQL è un secondo toolkit semmai.
```
