import type { ToolDef, ToolkitDef } from "./core/index"
import { toolkits } from "./registry"

export * from "./core/index"
export { toolkits }

export function listToolkits(): ToolkitDef[] {
  return Object.values(toolkits)
}

export function getToolkit(slug: string): ToolkitDef | undefined {
  return toolkits[slug]
}

export function getTool(
  toolkitSlug: string,
  toolSlug: string
): { toolkit: ToolkitDef; tool: ToolDef } | undefined {
  const toolkit = toolkits[toolkitSlug]
  const tool = toolkit?.tools.find((t) => t.slug === toolSlug)
  if (!toolkit || !tool) return undefined
  return { toolkit, tool }
}

/** Tool serialized for LLM/MCP/catalog consumption. */
export function toolToJSON(tool: ToolDef) {
  return {
    slug: tool.slug,
    description: tool.description,
    inputSchema: tool.jsonSchema,
    default: tool.default === true,
  }
}

/** Slugs exposed to LLMs by default: tools marked `default`, or all of them
 * if the toolkit marks none (keeps existing toolkits fully exposed). */
export function essentialToolSlugs(toolkit: ToolkitDef): string[] {
  const marked = toolkit.tools.filter((t) => t.default).map((t) => t.slug)
  return marked.length ? marked : toolkit.tools.map((t) => t.slug)
}
