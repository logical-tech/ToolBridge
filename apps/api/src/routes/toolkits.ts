import { Hono } from "hono"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import {
  essentialToolSlugs,
  getToolkit,
  listToolkits,
  toolToJSON,
  type ToolkitDef,
} from "@workspace/toolkits"
import { db, schema } from "../db"
import { getUserId } from "../session"

export const toolkitsRoute = new Hono()

// The user's exposed-tool set for a toolkit: their override, or the essentials.
async function resolveEnabled(userId: string, toolkit: ToolkitDef): Promise<string[]> {
  const [pref] = await db
    .select({ enabledSlugs: schema.toolPreference.enabledSlugs })
    .from(schema.toolPreference)
    .where(
      and(
        eq(schema.toolPreference.userId, userId),
        eq(schema.toolPreference.toolkitSlug, toolkit.slug)
      )
    )
  return pref ? pref.enabledSlugs : essentialToolSlugs(toolkit)
}

// GET /api/toolkits — catalog
toolkitsRoute.get("/", (c) =>
  c.json(
    listToolkits().map((t) => ({
      slug: t.slug,
      name: t.name,
      authType: t.auth.type,
      authTypes: [t.auth.type, ...(t.altAuth?.map((a) => a.type) ?? [])],
      authProvider: t.authProvider ?? null,
      toolCount: t.tools.length,
    }))
  )
)

// GET /api/toolkits/:slug — detail (metadata for the detail panel)
toolkitsRoute.get("/:slug", (c) => {
  const t = getToolkit(c.req.param("slug"))
  if (!t) return c.json({ error: "toolkit not found" }, 404)
  return c.json({
    slug: t.slug,
    name: t.name,
    authType: t.auth.type,
    authTypes: [t.auth.type, ...(t.altAuth?.map((a) => a.type) ?? [])],
    authProvider: t.authProvider ?? null,
    baseUrl: t.baseUrl,
    hasWebhooks: Boolean(t.webhooks),
    usage: t.usage ?? null,
    toolCount: t.tools.length,
  })
})

// GET /api/toolkits/:slug/tools — tools with JSON Schema.
// ?exposed=1 → only the tools this user exposes to LLMs (auth required).
toolkitsRoute.get("/:slug/tools", async (c) => {
  const toolkit = getToolkit(c.req.param("slug"))
  if (!toolkit) return c.json({ error: "toolkit not found" }, 404)
  if (c.req.query("exposed")) {
    const userId = await getUserId(c)
    if (!userId) return c.json({ error: "unauthorized" }, 401)
    const enabled = new Set(await resolveEnabled(userId, toolkit))
    return c.json(toolkit.tools.filter((t) => enabled.has(t.slug)).map(toolToJSON))
  }
  return c.json(toolkit.tools.map(toolToJSON))
})

// GET /api/toolkits/:slug/preferences — this user's exposed set + whether it's
// the default (no override stored).
toolkitsRoute.get("/:slug/preferences", async (c) => {
  const toolkit = getToolkit(c.req.param("slug"))
  if (!toolkit) return c.json({ error: "toolkit not found" }, 404)
  const userId = await getUserId(c)
  if (!userId) return c.json({ error: "unauthorized" }, 401)
  const [pref] = await db
    .select({ enabledSlugs: schema.toolPreference.enabledSlugs })
    .from(schema.toolPreference)
    .where(
      and(
        eq(schema.toolPreference.userId, userId),
        eq(schema.toolPreference.toolkitSlug, toolkit.slug)
      )
    )
  return c.json({
    enabled: pref ? pref.enabledSlugs : essentialToolSlugs(toolkit),
    isDefault: !pref,
  })
})

// PUT /api/toolkits/:slug/preferences — store the exposed set for this user.
toolkitsRoute.put("/:slug/preferences", async (c) => {
  const toolkit = getToolkit(c.req.param("slug"))
  if (!toolkit) return c.json({ error: "toolkit not found" }, 404)
  const userId = await getUserId(c)
  if (!userId) return c.json({ error: "unauthorized" }, 401)
  const parsed = z
    .object({ enabled: z.array(z.string()) })
    .safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.issues }, 400)

  // Keep only slugs that actually exist on the toolkit.
  const valid = new Set(toolkit.tools.map((t) => t.slug))
  const enabledSlugs = parsed.data.enabled.filter((s) => valid.has(s))
  await db
    .insert(schema.toolPreference)
    .values({ id: crypto.randomUUID(), userId, toolkitSlug: toolkit.slug, enabledSlugs })
    .onConflictDoUpdate({
      target: [schema.toolPreference.userId, schema.toolPreference.toolkitSlug],
      set: { enabledSlugs, updatedAt: new Date() },
    })
  return c.json({ enabled: enabledSlugs, isDefault: false })
})

// DELETE /api/toolkits/:slug/preferences — reset to the essential set.
toolkitsRoute.delete("/:slug/preferences", async (c) => {
  const toolkit = getToolkit(c.req.param("slug"))
  if (!toolkit) return c.json({ error: "toolkit not found" }, 404)
  const userId = await getUserId(c)
  if (!userId) return c.json({ error: "unauthorized" }, 401)
  await db
    .delete(schema.toolPreference)
    .where(
      and(
        eq(schema.toolPreference.userId, userId),
        eq(schema.toolPreference.toolkitSlug, toolkit.slug)
      )
    )
  return c.json({ enabled: essentialToolSlugs(toolkit), isDefault: true })
})
