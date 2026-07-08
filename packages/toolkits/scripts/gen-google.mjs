// Generate <toolkit>/generated/*.ts from Google's official Discovery documents.
// Every API method becomes an httpTool (default:false — opt-in long tail),
// grouped by its resource. Run: `bun run gen:google` (from packages/toolkits).
//
// Discovery docs are the Google analog of GitHub's OpenAPI spec.
import { fileURLToPath } from "node:url"
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, "..", "src")

// Each API → the toolkit dir + the baseUrl its toolkit uses. The full request
// URL is always `rootUrl + servicePath + method.path`; we set baseUrl to
// `<host>/<api>/<version>` and emit method paths relative to it (stripping that
// prefix), so generated tools sit under the same baseUrl as the curated ones.
const APIS = [
  { toolkit: "gmail", base: "https://gmail.googleapis.com/gmail/v1", url: "https://gmail.googleapis.com/$discovery/rest?version=v1" },
  { toolkit: "google-drive", base: "https://www.googleapis.com/drive/v3", url: "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest" },
  { toolkit: "google-calendar", base: "https://www.googleapis.com/calendar/v3", url: "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest" },
]

async function loadDoc(url, cacheKey) {
  const cache = join(HERE, `.google-${cacheKey}.json`) // gitignored
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8"))
  console.log(`downloading discovery: ${cacheKey}…`)
  const doc = await (await fetch(url)).json()
  writeFileSync(cache, JSON.stringify(doc))
  return doc
}

const ident = (s) => s.replace(/[^a-zA-Z0-9]/g, "_").replace(/^(\d)/, "_$1")

// Discovery $ref is a bare schema name in `doc.schemas`. Deref shallowly with a
// depth+cycle guard, dropping noisy keys — same shape gen-github produces.
const DROP = new Set(["annotations", "readOnly", "pattern", "etag"])
function deref(node, schemas, seen, depth) {
  if (!node || typeof node !== "object") return node
  if (depth > 4) return { type: node.type ?? "object" }
  if (node.$ref) {
    if (seen.has(node.$ref)) return { type: "object" }
    return deref(schemas[node.$ref], schemas, new Set([...seen, node.$ref]), depth + 1)
  }
  if (Array.isArray(node)) return node.map((n) => deref(n, schemas, seen, depth + 1))
  const out = {}
  for (const [k, v] of Object.entries(node)) {
    if (DROP.has(k)) continue
    if (k === "$ref") continue
    out[k] = typeof v === "object" ? deref(v, schemas, seen, depth + 1) : v
  }
  return out
}

function build(method, schemas) {
  const properties = {}, required = [], pathParams = [], queryParams = []
  let hasBody = false, bodyCaptured = false
  for (const [name, p] of Object.entries(method.parameters ?? {})) {
    if (p.location === "path") pathParams.push(name)
    else if (p.location === "query") queryParams.push(name)
    else continue
    const s = deref({ ...p }, schemas, new Set(), 0)
    delete s.location
    delete s.required
    properties[name] = s
    if (p.location === "path" || p.required) required.push(name)
  }
  if (method.request) {
    hasBody = true
    const bs = deref(method.request, schemas, new Set(), 0)
    if (bs && bs.properties) {
      bodyCaptured = true
      for (const [k, v] of Object.entries(bs.properties)) if (!(k in properties)) properties[k] = v
    }
  }
  const schema = { type: "object", properties }
  if (required.length) schema.required = [...new Set(required)]
  schema.additionalProperties = hasBody && !bodyCaptured
  return { schema, pathParams, queryParams }
}

// Walk the nested resources tree, collecting methods tagged with their resource.
function collect(resources, cat, out) {
  for (const [name, res] of Object.entries(resources ?? {})) {
    for (const method of Object.values(res.methods ?? {})) out.push({ cat: name, method })
    if (res.resources) collect(res.resources, name, out)
  }
}

for (const { toolkit, base, url } of APIS) {
  const doc = await loadDoc(url, toolkit)
  const schemas = doc.schemas ?? {}
  const methods = []
  collect(doc.resources, "misc", methods)

  // Prefix to strip so paths are relative to `base` (e.g. "gmail/v1/").
  const prefix = new URL(base).pathname.replace(/^\/+/, "") + "/"

  const byCat = new Map()
  for (const { cat, method } of methods) {
    const { schema, pathParams, queryParams } = build(method, schemas)
    // Full path after host = servicePath + method.path; drop the base prefix.
    let rel = (doc.servicePath ?? "") + method.path
    rel = rel.replace(/^\/+/, "")
    if (rel.startsWith(prefix)) rel = rel.slice(prefix.length)
    const tool = {
      slug: method.id, // e.g. "gmail.users.messages.send" — no collision with curated
      description: (method.description ?? method.id).trim().split("\n")[0].slice(0, 300),
      method: method.httpMethod,
      path: "/" + rel,
      pathParams,
      queryParams,
      jsonSchema: schema,
      default: false,
    }
    if (!byCat.has(cat)) byCat.set(cat, [])
    byCat.get(cat).push(tool)
  }

  const OUT = join(SRC, toolkit, "generated")
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const cats = [...byCat.keys()].sort()
  for (const cat of cats) {
    const tools = byCat.get(cat).sort((a, b) => a.slug.localeCompare(b.slug))
    const body = tools.map((t) => `  httpTool(${JSON.stringify(t)}),`).join("\n")
    writeFileSync(
      join(OUT, `${cat}.ts`),
      `// AUTO-GENERATED from Google Discovery — do not edit. Regenerate: bun run gen:google\nimport { httpTool } from "../../core/index"\n\nexport const ${ident(cat)} = [\n${body}\n]\n`
    )
  }
  const imports = cats.map((c) => `import { ${ident(c)} } from "./${c}"`).join("\n")
  const spread = cats.map((c) => `  ...${ident(c)},`).join("\n")
  writeFileSync(
    join(OUT, "index.ts"),
    `// AUTO-GENERATED — do not edit. Regenerate: bun run gen:google\nimport type { ToolDef } from "../../core/index"\n${imports}\n\nexport const generatedTools: ToolDef[] = [\n${spread}\n]\n`
  )
  console.log(`${toolkit}: generated ${methods.length} tools across ${cats.length} resources`)
}
