import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { getToolkit } from "@workspace/toolkits"
import { db, schema } from "../db"
import { decrypt, verifyHmacSha256 } from "../crypto"

export const webhooksRoute = new Hono()

// POST /api/webhooks/:slug/:authConfigId — external trigger receiver.
// No session: authenticity comes from the HMAC signature. The URL carries the
// auth config id because each registered OAuth app has its own webhook secret.
webhooksRoute.post("/:slug/:authConfigId", async (c) => {
  const toolkit = getToolkit(c.req.param("slug"))
  if (!toolkit?.webhooks) return c.json({ error: "not found" }, 404)
  const wh = toolkit.webhooks

  const [cfg] = await db
    .select()
    .from(schema.authConfig)
    .where(eq(schema.authConfig.id, c.req.param("authConfigId")))
  if (!cfg?.webhookSecretEncrypted) return c.json({ error: "not found" }, 404)

  const raw = await c.req.text()
  const header = c.req.header(wh.signatureHeader)
  if (!header) return c.json({ error: "missing signature" }, 401)

  const providedHex =
    wh.signaturePrefix && header.startsWith(wh.signaturePrefix)
      ? header.slice(wh.signaturePrefix.length)
      : header

  const secret = await decrypt(cfg.webhookSecretEncrypted)
  if (!(await verifyHmacSha256(secret, raw, providedHex)))
    return c.json({ error: "invalid signature" }, 401)

  await db.insert(schema.triggerEvent).values({
    id: crypto.randomUUID(),
    authConfigId: cfg.id,
    toolkitSlug: toolkit.slug,
    eventType: (wh.eventHeader && c.req.header(wh.eventHeader)) || "event",
    payload: safeJson(raw),
  })
  return c.body(null, 204)
})

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
