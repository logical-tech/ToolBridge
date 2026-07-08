# Tool Bridge

A self-hosted bridge that gives LLMs authenticated access to third-party tools
(Google Calendar, Gmail, Google Drive, GitHub, Slack, …). You connect your
accounts once through a dashboard; agents then call the tools over a small HTTP
API using an API key — Tool Bridge injects the right credentials and never
exposes tokens to the caller.

- **`apps/api`** — Hono + Bun API. Auth (Better Auth), credential storage
  (AES-256-GCM encrypted in Postgres), OAuth flows, tool execution, webhooks.
- **`apps/web`** — Vite + React dashboard for signing in and connecting accounts.
- **`packages/toolkits`** — the toolkit definitions (one per provider).
- **`packages/ui`** — shared shadcn/ui components.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3 (`packageManager` pins `bun@1.3.14`)
- Docker (for local Postgres) — or any Postgres 17 you point `DATABASE_URL` at
- Node ≥ 20

## Quick start

```bash
# 1. install deps (root of the monorepo)
bun install

# 2. start Postgres
docker compose up -d

# 3. configure env — copy the examples and fill in the secrets
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# generate the two required secrets and paste them into apps/api/.env
openssl rand -base64 32   # → BETTER_AUTH_SECRET
openssl rand -base64 32   # → ENCRYPTION_KEY (must decode to 32 bytes)

# 4. run everything (turbo runs api + web together)
bun run dev
```

- API: <http://localhost:3000> (health check: `/health`)
- Dashboard: <http://localhost:5173>

The database schema is created automatically: the API runs pending Drizzle
migrations on every startup (`syncSchema()` in `apps/api/src/db/sync.ts`), so a
fresh Postgres just works — no manual migrate step needed. To manage the schema
by hand, use the scripts in `apps/api` (`bun run db:generate`, `db:migrate`,
`db:studio`).

## Environment variables

| Var | App | Required | Purpose |
|-----|-----|----------|---------|
| `DATABASE_URL` | api | yes | Postgres connection string |
| `BETTER_AUTH_SECRET` | api | yes | Session signing + OAuth-state HMAC. `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | api | yes | AES-256-GCM key for stored credentials, **32 bytes base64**. `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | api | yes | Public base URL of the API (used to build OAuth callback URLs) |
| `WEB_URL` | api | yes | Dashboard URL — CORS origin + auth trusted origin |
| `PORT` | api | no | API port (default `3000`) |
| `VITE_API_URL` | web | no | API base URL the dashboard calls (default `http://localhost:3000`) |

> Provider credentials (Google/GitHub/Slack client IDs & secrets) are **not**
> environment variables. They're entered in the dashboard and stored encrypted
> per user — see below.

## Connecting providers

Each provider needs an OAuth client (or app) that you create once in that
provider's console, then register in the Tool Bridge dashboard as an
"auth config". The client ID/secret are encrypted with `ENCRYPTION_KEY` and
stored in the `auth_config` table. The redirect/callback URL is always:

```
<BETTER_AUTH_URL>/api/connections/callback/<toolkit-slug>
```

e.g. `http://localhost:3000/api/connections/callback/google-calendar`.

### Google (Calendar, Gmail, Drive)

All three Google toolkits share one OAuth client (`authProvider: "google"`), so
you set this up once.

1. **Create a project** — go to the
   [Google Cloud Console](https://console.cloud.google.com/), click the project
   picker → **New Project**, name it (e.g. `tool-bridge`), and create it. Make
   sure it's selected.
2. **Enable the APIs** — in **APIs & Services → Library**, enable the ones you
   need:
   - Google Calendar API
   - Gmail API
   - Google Drive API
3. **Configure the OAuth consent screen** — **APIs & Services → OAuth consent
   screen**. Pick **External** (or **Internal** if you're on Workspace and only
   your org connects), fill in the app name and support email. Add the scopes
   your toolkits use, or just add test users and leave the app in **Testing**
   for local dev:
   - Calendar: `https://www.googleapis.com/auth/calendar`
   - Gmail: `https://www.googleapis.com/auth/gmail.modify`
   - Drive: `https://www.googleapis.com/auth/drive`

   Add your own Google account under **Test users** while the app is unverified.
4. **Create OAuth credentials** — **APIs & Services → Credentials → Create
   Credentials → OAuth client ID**. Application type **Web application**. Under
   **Authorized redirect URIs** add:
   ```
   http://localhost:3000/api/connections/callback/google-calendar
   http://localhost:3000/api/connections/callback/gmail
   http://localhost:3000/api/connections/callback/google-drive
   ```
   (For production, add the same paths under your real `BETTER_AUTH_URL`.)
5. **Copy the Client ID and Client secret** into the Tool Bridge dashboard when
   creating the Google auth config. Now connecting Calendar/Gmail/Drive is a
   single authorize click each.

Google returns a refresh token only with `access_type=offline` + `prompt=consent`
— the toolkits already request both, so you get long-lived connections.

### GitHub

Two ways to connect, chosen when you create the auth config:

- **OAuth App** — GitHub → **Settings → Developer settings → OAuth Apps → New
  OAuth App**. Set the **Authorization callback URL** to
  `http://localhost:3000/api/connections/callback/github`. Use the resulting
  Client ID/secret.
- **GitHub App** (for finer-grained / installation-based access) — create a
  GitHub App, download its **private key** (`.pem`), and register the App ID +
  private key as the auth config. Tool Bridge mints short-lived installation
  tokens from these (`apps/api/src/github-app.ts`).

### Slack

Create an app at <https://api.slack.com/apps> → **OAuth & Permissions**. Add the
redirect URL `http://localhost:3000/api/connections/callback/slack` and the bot
scopes `chat:write`, `channels:read`. Register the Client ID/secret as the Slack
auth config.

## Common scripts

```bash
bun run dev         # run api + web (turbo)
bun run build       # build all workspaces
bun run typecheck   # type-check all workspaces
bun run lint        # lint

# from apps/api
bun run db:studio   # Drizzle Studio (browse the DB)
bun run db:generate # generate a migration from schema.ts changes
```

## Security notes

- `.env` files are gitignored (`.env.example` is the only committed variant).
- Never reuse the docker-compose Postgres password (`toolbridge/toolbridge`)
  outside local dev.
- In production, keep `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, and every provider
  private key in your host's secret store — not in a committed file. Rotating
  `ENCRYPTION_KEY` invalidates all previously stored credentials.
