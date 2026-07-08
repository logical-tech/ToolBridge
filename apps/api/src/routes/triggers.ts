import { Hono } from "hono"
import { desc, eq } from "drizzle-orm"
import { db, schema } from "../db"
import { getUserId } from "../session"

export const triggersRoute = new Hono()

// GET /api/triggers/events — recent trigger events for the user's auth configs.
triggersRoute.get("/events", async (c) => {
  const userId = await getUserId(c)
  if (!userId) return c.json({ error: "unauthorized" }, 401)

  const rows = await db
    .select({
      id: schema.triggerEvent.id,
      toolkitSlug: schema.triggerEvent.toolkitSlug,
      eventType: schema.triggerEvent.eventType,
      payload: schema.triggerEvent.payload,
      createdAt: schema.triggerEvent.createdAt,
    })
    .from(schema.triggerEvent)
    .innerJoin(
      schema.authConfig,
      eq(schema.triggerEvent.authConfigId, schema.authConfig.id)
    )
    .where(eq(schema.authConfig.ownerId, userId))
    .orderBy(desc(schema.triggerEvent.createdAt))
    .limit(50)
  return c.json(rows)
})
