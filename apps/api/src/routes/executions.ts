import { Hono } from "hono"
import { desc, eq } from "drizzle-orm"
import { db, schema } from "../db"
import { getUserId } from "../session"

export const executionsRoute = new Hono()

// GET /api/executions — recent tool executions for the user's connected accounts.
executionsRoute.get("/", async (c) => {
  const userId = await getUserId(c)
  if (!userId) return c.json({ error: "unauthorized" }, 401)

  const rows = await db
    .select({
      id: schema.toolExecution.id,
      toolSlug: schema.toolExecution.toolSlug,
      status: schema.toolExecution.status,
      durationMs: schema.toolExecution.durationMs,
      output: schema.toolExecution.output,
      createdAt: schema.toolExecution.createdAt,
      toolkitSlug: schema.connectedAccount.toolkitSlug,
    })
    .from(schema.toolExecution)
    .innerJoin(
      schema.connectedAccount,
      eq(schema.toolExecution.connectedAccountId, schema.connectedAccount.id)
    )
    .where(eq(schema.connectedAccount.userId, userId))
    .orderBy(desc(schema.toolExecution.createdAt))
    .limit(50)
  return c.json(rows)
})
