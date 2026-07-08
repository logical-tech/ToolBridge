import { Hono } from "hono"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { getToolkit } from "@workspace/toolkits"
import { db, schema } from "../db"
import { encrypt } from "../crypto"
import { getUserId } from "../session"

export const authConfigsRoute = new Hono()

const bodySchema = z.object({
  toolkitSlug: z.string(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  webhookSecret: z.string().optional(),
  scopes: z.array(z.string()).optional(),
})

// POST /api/auth-configs — store an app's OAuth client id/secret for a toolkit.
authConfigsRoute.post("/", async (c) => {
  const userId = await getUserId(c)
  if (!userId) return c.json({ error: "unauthorized" }, 401)

  const parsed = bodySchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)
  const { toolkitSlug, clientId, clientSecret, webhookSecret, scopes } = parsed.data

  if (!getToolkit(toolkitSlug)) return c.json({ error: "unknown toolkit" }, 400)

  // One config per (owner, toolkit) — reconnecting updates it instead of duplicating.
  const values = {
    clientId,
    clientSecretEncrypted: clientSecret ? await encrypt(clientSecret) : null,
    webhookSecretEncrypted: webhookSecret ? await encrypt(webhookSecret) : null,
    scopes,
    updatedAt: new Date(),
  }
  const [row] = await db
    .insert(schema.authConfig)
    .values({ id: crypto.randomUUID(), toolkitSlug, ownerId: userId, ...values })
    .onConflictDoUpdate({
      target: [schema.authConfig.ownerId, schema.authConfig.toolkitSlug],
      set: values,
    })
    .returning({ id: schema.authConfig.id })
  return c.json({ id: row.id }, 201)
})

// GET /api/auth-configs — list own configs (no secrets).
authConfigsRoute.get("/", async (c) => {
  const userId = await getUserId(c)
  if (!userId) return c.json({ error: "unauthorized" }, 401)

  const rows = await db
    .select({
      id: schema.authConfig.id,
      toolkitSlug: schema.authConfig.toolkitSlug,
      clientId: schema.authConfig.clientId,
      scopes: schema.authConfig.scopes,
      createdAt: schema.authConfig.createdAt,
    })
    .from(schema.authConfig)
    .where(eq(schema.authConfig.ownerId, userId))
  return c.json(rows)
})
