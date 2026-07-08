import { eq } from "drizzle-orm"
import { getToolkit, type OAuth2Auth } from "@workspace/toolkits"
import { db, schema } from "./db"
import { decrypt, encrypt } from "./crypto"
import { fetchInstallationToken, githubAppJwt } from "./github-app"

// Decrypted credentials stored per connected_account (shape depends on auth type).
export type Credentials =
  | { type: "oauth2"; accessToken: string; refreshToken?: string; expiresAt?: number }
  | { type: "apiKey"; apiKey: string }
  | { type: "basic"; username: string; password: string }
  // GitHub App: only the installationId is stored; token is minted/cached on demand.
  | { type: "githubApp"; installationId: string; token?: string; expiresAt?: number }

/** OAuth token endpoint call (initial code exchange or refresh). Expects JSON back. */
export async function oauthTokenRequest(
  tokenUrl: string,
  params: Record<string, string>
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(params),
  })
  const json = (await res.json()) as any
  if (!res.ok || json.error || !json.access_token)
    throw new Error(`token endpoint failed: ${JSON.stringify(json)}`)
  return json
}

/**
 * Central credential accessor for tool execution.
 * Refreshes an expired OAuth token in place, then returns usable credentials.
 */
export async function getValidCredentials(
  connectedAccountId: string
): Promise<Credentials> {
  const [acc] = await db
    .select()
    .from(schema.connectedAccount)
    .where(eq(schema.connectedAccount.id, connectedAccountId))
  if (!acc || !acc.credentialsEncrypted)
    throw new Error("connected account has no credentials")

  const creds = JSON.parse(await decrypt(acc.credentialsEncrypted)) as Credentials
  const skewMs = 60_000

  // GitHub App: mint/refresh a short-lived installation token from appId + private key.
  if (creds.type === "githubApp") {
    if (creds.token && creds.expiresAt && creds.expiresAt - Date.now() > skewMs) return creds
    const [cfg] = await db
      .select()
      .from(schema.authConfig)
      .where(eq(schema.authConfig.id, acc.authConfigId))
    if (!cfg?.clientId || !cfg.clientSecretEncrypted)
      throw new Error("github app config missing appId/private key")
    const jwt = githubAppJwt(cfg.clientId, await decrypt(cfg.clientSecretEncrypted), Math.floor(Date.now() / 1000))
    const t = await fetchInstallationToken(jwt, creds.installationId)
    const next: Credentials = {
      type: "githubApp",
      installationId: creds.installationId,
      token: t.token,
      expiresAt: Date.parse(t.expires_at),
    }
    await db
      .update(schema.connectedAccount)
      .set({
        credentialsEncrypted: await encrypt(JSON.stringify(next)),
        expiresAt: new Date(next.expiresAt!),
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(schema.connectedAccount.id, connectedAccountId))
    return next
  }

  if (creds.type !== "oauth2") return creds

  // OAuth2: refresh if within 60s of expiry (or already past).
  if (!creds.expiresAt || !creds.refreshToken || creds.expiresAt - Date.now() > skewMs)
    return creds

  const toolkit = getToolkit(acc.toolkitSlug)
  const [cfg] = await db
    .select()
    .from(schema.authConfig)
    .where(eq(schema.authConfig.id, acc.authConfigId))
  if (!toolkit || toolkit.auth.type !== "oauth2" || !cfg?.clientId || !cfg.clientSecretEncrypted)
    return creds // can't refresh — hand back what we have

  const token = await oauthTokenRequest((toolkit.auth as OAuth2Auth).tokenUrl, {
    grant_type: "refresh_token",
    refresh_token: creds.refreshToken,
    client_id: cfg.clientId,
    client_secret: await decrypt(cfg.clientSecretEncrypted),
  })

  const next: Credentials = {
    type: "oauth2",
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? creds.refreshToken,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
  }
  await db
    .update(schema.connectedAccount)
    .set({
      credentialsEncrypted: await encrypt(JSON.stringify(next)),
      expiresAt: next.expiresAt ? new Date(next.expiresAt) : null,
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(schema.connectedAccount.id, connectedAccountId))
  return next
}
