import { Hono } from "hono"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { getToolkit, type OAuth2Auth } from "@workspace/toolkits"
import { db, schema } from "../db"
import { decrypt, encrypt, signState, verifyState } from "../crypto"
import { oauthTokenRequest, type Credentials } from "../credentials"
import { getUserId } from "../session"

export const connectionsRoute = new Hono()

const redirectUri = (slug: string) =>
  `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/api/connections/callback/${slug}`

const startSchema = z.object({
  authConfigId: z.string(),
  // Connect a different toolkit than the auth_config was created for — only
  // allowed within one auth provider (e.g. reuse the Google client for Drive).
  toolkitSlug: z.string().optional(),
  // pick a non-primary strategy (e.g. "githubApp"); default = toolkit.auth
  authType: z.enum(["oauth2", "githubApp"]).optional(),
  installationId: z.string().optional(), // githubApp
  // apiKey/basic credentials (ignored for oauth2)
  apiKey: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
})

// POST /api/connections — begin a connection.
// oauth2 → { redirectUrl }; apiKey/basic → credentials saved immediately.
connectionsRoute.post("/", async (c) => {
  const userId = await getUserId(c)
  if (!userId) return c.json({ error: "unauthorized" }, 401)

  const parsed = startSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
  const { authConfigId, toolkitSlug, authType, installationId, apiKey, username, password } =
    parsed.data

  const [cfg] = await db
    .select()
    .from(schema.authConfig)
    .where(
      and(eq(schema.authConfig.id, authConfigId), eq(schema.authConfig.ownerId, userId))
    )
  if (!cfg) return c.json({ error: "auth config not found" }, 404)

  // Target toolkit defaults to the auth_config's own; a different one is only
  // allowed when both share an auth provider (Google apps → one OAuth client).
  const targetSlug = toolkitSlug ?? cfg.toolkitSlug
  const toolkit = getToolkit(targetSlug)
  if (!toolkit) return c.json({ error: "unknown toolkit" }, 400)
  if (targetSlug !== cfg.toolkitSlug) {
    const cfgToolkit = getToolkit(cfg.toolkitSlug)
    if (!toolkit.authProvider || cfgToolkit?.authProvider !== toolkit.authProvider)
      return c.json({ error: "auth config not compatible with this toolkit" }, 400)
  }

  // One connection per (user, toolkit): reconnecting updates the existing row.
  const conflictTarget = [
    schema.connectedAccount.userId,
    schema.connectedAccount.toolkitSlug,
  ]

  // GitHub App: store the installationId; token is minted lazily on first use.
  // appId + private key live on the auth_config (clientId + clientSecret).
  if (authType === "githubApp") {
    if (!installationId) return c.json({ error: "installationId required" }, 400)
    const creds: Credentials = { type: "githubApp", installationId }
    const credentialsEncrypted = await encrypt(JSON.stringify(creds))
    const [row] = await db
      .insert(schema.connectedAccount)
      .values({
        id: crypto.randomUUID(),
        userId,
        authConfigId: cfg.id,
        toolkitSlug: toolkit.slug,
        credentialsEncrypted,
        status: "active",
      })
      .onConflictDoUpdate({
        target: conflictTarget,
        set: { authConfigId: cfg.id, credentialsEncrypted, status: "active", expiresAt: null, updatedAt: new Date() },
      })
      .returning({ id: schema.connectedAccount.id })
    return c.json({ id: row.id, status: "active" }, 201)
  }

  if (toolkit.auth.type === "oauth2") {
    const [row] = await db
      .insert(schema.connectedAccount)
      .values({
        id: crypto.randomUUID(),
        userId,
        authConfigId: cfg.id,
        toolkitSlug: toolkit.slug,
        status: "pending",
      })
      .onConflictDoUpdate({
        target: conflictTarget,
        set: {
          authConfigId: cfg.id,
          status: "pending",
          credentialsEncrypted: null,
          expiresAt: null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: schema.connectedAccount.id })

    const auth = toolkit.auth as OAuth2Auth
    // Reused config: use the target toolkit's own scopes, not the config's
    // (those belong to whichever Google app first stored the credentials).
    const scopes = (targetSlug === cfg.toolkitSlug ? cfg.scopes : null) ?? auth.scopes ?? []
    const url = new URL(auth.authorizationUrl)
    url.searchParams.set("client_id", cfg.clientId ?? "")
    url.searchParams.set("redirect_uri", redirectUri(toolkit.slug))
    url.searchParams.set("response_type", "code")
    url.searchParams.set("state", await signState(row.id))
    if (scopes.length) url.searchParams.set("scope", scopes.join(" "))
    for (const [k, v] of Object.entries(auth.authorizeParams ?? {}))
      url.searchParams.set(k, v)
    return c.json({ redirectUrl: url.toString() })
  }

  // apiKey / basic — save credentials directly, active immediately.
  let creds: Credentials
  if (toolkit.auth.type === "apiKey") {
    if (!apiKey) return c.json({ error: "apiKey required" }, 400)
    creds = { type: "apiKey", apiKey }
  } else {
    if (!username || !password) return c.json({ error: "username and password required" }, 400)
    creds = { type: "basic", username, password }
  }

  const credentialsEncrypted = await encrypt(JSON.stringify(creds))
  const [row] = await db
    .insert(schema.connectedAccount)
    .values({
      id: crypto.randomUUID(),
      userId,
      authConfigId: cfg.id,
      toolkitSlug: toolkit.slug,
      credentialsEncrypted,
      status: "active",
    })
    .onConflictDoUpdate({
      target: conflictTarget,
      set: { authConfigId: cfg.id, credentialsEncrypted, status: "active", expiresAt: null, updatedAt: new Date() },
    })
    .returning({ id: schema.connectedAccount.id })
  return c.json({ id: row.id, status: "active" }, 201)
})

// GET /api/connections/callback/:slug — OAuth2 redirect target.
connectionsRoute.get("/callback/:slug", async (c) => {
  const slug = c.req.param("slug")
  const code = c.req.query("code")
  const state = c.req.query("state")
  if (!code || !state) return c.json({ error: "missing code/state" }, 400)

  const accountId = await verifyState(state)
  if (!accountId) return c.json({ error: "invalid state" }, 400)

  const [acc] = await db
    .select()
    .from(schema.connectedAccount)
    .where(eq(schema.connectedAccount.id, accountId))
  if (!acc || acc.toolkitSlug !== slug) return c.json({ error: "connection not found" }, 404)

  const toolkit = getToolkit(slug)
  const [cfg] = await db
    .select()
    .from(schema.authConfig)
    .where(eq(schema.authConfig.id, acc.authConfigId))
  if (!toolkit || toolkit.auth.type !== "oauth2" || !cfg?.clientId || !cfg.clientSecretEncrypted)
    return c.json({ error: "oauth config incomplete" }, 400)

  try {
    const token = await oauthTokenRequest((toolkit.auth as OAuth2Auth).tokenUrl, {
      grant_type: "authorization_code",
      code,
      client_id: cfg.clientId,
      client_secret: await decrypt(cfg.clientSecretEncrypted),
      redirect_uri: redirectUri(slug),
    })
    const creds: Credentials = {
      type: "oauth2",
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
    }
    await db
      .update(schema.connectedAccount)
      .set({
        credentialsEncrypted: await encrypt(JSON.stringify(creds)),
        status: "active",
        expiresAt: creds.expiresAt ? new Date(creds.expiresAt) : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.connectedAccount.id, accountId))
  } catch (err) {
    await db
      .update(schema.connectedAccount)
      .set({ status: "error", updatedAt: new Date() })
      .where(eq(schema.connectedAccount.id, accountId))
    return c.json({ error: String(err) }, 502)
  }

  const web = process.env.WEB_URL ?? "http://localhost:5173"
  return c.redirect(`${web}/connections?connected=${slug}`)
})

// GET /api/connections — list own connections (no secrets).
connectionsRoute.get("/", async (c) => {
  const userId = await getUserId(c)
  if (!userId) return c.json({ error: "unauthorized" }, 401)

  const rows = await db
    .select({
      id: schema.connectedAccount.id,
      authConfigId: schema.connectedAccount.authConfigId,
      toolkitSlug: schema.connectedAccount.toolkitSlug,
      status: schema.connectedAccount.status,
      expiresAt: schema.connectedAccount.expiresAt,
      createdAt: schema.connectedAccount.createdAt,
    })
    .from(schema.connectedAccount)
    .where(eq(schema.connectedAccount.userId, userId))
  return c.json(rows)
})

// DELETE /api/connections/:id — disconnect (only your own).
connectionsRoute.delete("/:id", async (c) => {
  const userId = await getUserId(c)
  if (!userId) return c.json({ error: "unauthorized" }, 401)

  const [row] = await db
    .delete(schema.connectedAccount)
    .where(
      and(
        eq(schema.connectedAccount.id, c.req.param("id")),
        eq(schema.connectedAccount.userId, userId)
      )
    )
    .returning({ id: schema.connectedAccount.id })
  if (!row) return c.json({ error: "not found" }, 404)
  return c.body(null, 204)
})
