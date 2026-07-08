import { Hono } from "hono"
import { and, eq } from "drizzle-orm"
import { getTool } from "@workspace/toolkits"
import { db, schema } from "../db"
import { getUserId } from "../session"
import { getValidCredentials } from "../credentials"
import { HttpError, makeContext } from "../execute"

export const toolsRoute = new Hono()

// POST /api/tools/:toolkit/:tool/execute
// Body: { connectedAccountId?, arguments }. connectedAccountId optional if the user
// has exactly one active account for the toolkit. Auth: session cookie or x-api-key.
toolsRoute.post("/:toolkit/:tool/execute", async (c) => {
  const userId = await getUserId(c)
  if (!userId) return c.json({ error: "unauthorized" }, 401)

  const found = getTool(c.req.param("toolkit"), c.req.param("tool"))
  if (!found) return c.json({ error: "tool not found" }, 404)
  const { toolkit, tool } = found

  const body = (await c.req.json().catch(() => ({}))) as {
    connectedAccountId?: string
    arguments?: unknown
    input?: unknown
  }

  const parsed = tool.parse(body.arguments ?? body.input ?? {})
  if (!parsed.ok) return c.json({ error: parsed.issues }, 400)

  // Resolve the connected account (explicit id, else the user's active one).
  const accounts = await db
    .select()
    .from(schema.connectedAccount)
    .where(
      body.connectedAccountId
        ? and(
            eq(schema.connectedAccount.id, body.connectedAccountId),
            eq(schema.connectedAccount.userId, userId)
          )
        : and(
            eq(schema.connectedAccount.userId, userId),
            eq(schema.connectedAccount.toolkitSlug, toolkit.slug),
            eq(schema.connectedAccount.status, "active")
          )
    )
  const account = accounts[0]
  if (!account) return c.json({ error: "no connected account for this toolkit" }, 400)
  if (body.connectedAccountId && accounts.length && account.status !== "active")
    return c.json({ error: `account is ${account.status}` }, 400)
  if (!body.connectedAccountId && accounts.length > 1)
    return c.json({ error: "multiple active accounts — pass connectedAccountId" }, 400)

  const started = Date.now()
  let output: unknown
  let status: "success" | "error"
  try {
    // getValidCredentials can fail (e.g. OAuth refresh or GitHub App token mint) — treat as an execution error.
    const creds = await getValidCredentials(account.id)
    output = await tool.execute(parsed.data, makeContext(toolkit, creds))
    status = "success"
  } catch (err) {
    status = "error"
    output = err instanceof HttpError ? { status: err.status, body: err.body } : { message: String(err) }
  }

  await db.insert(schema.toolExecution).values({
    id: crypto.randomUUID(),
    connectedAccountId: account.id,
    toolSlug: `${toolkit.slug}.${tool.slug}`,
    input: parsed.data,
    output,
    status,
    durationMs: Date.now() - started,
  })

  return c.json({ status, output }, status === "success" ? 200 : 502)
})
