// Generate github/generated/*.ts from GitHub's official OpenAPI description.
// Every operation with `x-github.enabledForGitHubApps: true` becomes an httpTool,
// grouped by `x-github.category`. Run: `bun run gen:github` (from packages/toolkits).
//
// Spec source (moving target — pin to a release tag for a reproducible build):
//   github/rest-api-description @ main, descriptions/api.github.com/api.github.com.json
import { fileURLToPath } from "node:url"
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"

const SPEC_URL =
  "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json"
const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, "..", "src", "github", "generated")
const CACHE = join(HERE, ".gh-openapi.json") // gitignored; avoids re-downloading

async function loadSpec() {
  if (existsSync(CACHE)) return JSON.parse(readFileSync(CACHE, "utf8"))
  console.log("downloading OpenAPI spec…")
  const spec = await (await fetch(SPEC_URL)).json()
  writeFileSync(CACHE, JSON.stringify(spec))
  return spec
}

const spec = await loadSpec()

const resolveRef = (ref) => {
  const parts = ref.replace(/^#\//, "").split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"))
  let n = spec
  for (const p of parts) n = n?.[p]
  return n
}

const DROP = new Set(["example", "examples", "x-github", "externalDocs", "deprecated", "nullable", "readOnly", "writeOnly"])
function deref(node, seen, depth) {
  if (!node || typeof node !== "object") return node
  if (depth > 4) return { type: node.type ?? "object" }
  if (node.$ref) {
    if (seen.has(node.$ref)) return { type: "object" }
    return deref(resolveRef(node.$ref), new Set([...seen, node.$ref]), depth + 1)
  }
  if (Array.isArray(node)) return node.map((n) => deref(n, seen, depth + 1))
  const out = {}
  for (const [k, v] of Object.entries(node)) {
    if (DROP.has(k)) continue
    out[k] = typeof v === "object" ? deref(v, seen, depth + 1) : v
  }
  return out
}

function build(op) {
  const properties = {}, required = [], pathParams = [], queryParams = []
  let bodyCaptured = false, hasBody = false
  for (let param of op.parameters ?? []) {
    if (param.$ref) param = resolveRef(param.$ref)
    if (!param) continue
    if (param.in === "path") pathParams.push(param.name)
    else if (param.in === "query") queryParams.push(param.name)
    else continue
    const s = deref(param.schema ?? { type: "string" }, new Set(), 0)
    if (param.description) s.description = param.description
    properties[param.name] = s
    if (param.in === "path" || param.required) required.push(param.name)
  }
  const rb = op.requestBody
  if (rb) {
    hasBody = true
    let bs = rb.content?.["application/json"]?.schema
    if (bs) {
      bs = deref(bs, new Set(), 0)
      if (bs.properties) {
        bodyCaptured = true
        for (const [k, v] of Object.entries(bs.properties)) properties[k] = v
        if (rb.required && Array.isArray(bs.required)) required.push(...bs.required)
      }
    }
  }
  const schema = { type: "object", properties }
  if (required.length) schema.required = [...new Set(required)]
  schema.additionalProperties = hasBody && !bodyCaptured
  return { schema, pathParams, queryParams }
}

const ident = (s) => s.replace(/[^a-zA-Z0-9]/g, "_").replace(/^(\d)/, "_$1")

const byCat = new Map()
let total = 0
for (const [path, item] of Object.entries(spec.paths)) {
  for (const method of ["get", "post", "put", "patch", "delete"]) {
    const op = item[method]
    if (!op || op["x-github"]?.enabledForGitHubApps !== true) continue
    const cat = op["x-github"]?.category ?? "misc"
    const { schema, pathParams, queryParams } = build(op)
    const tool = {
      slug: op.operationId.replace(/\//g, "."),
      description: (op.summary ?? op.operationId).trim(),
      method,
      path,
      pathParams,
      queryParams,
      jsonSchema: schema,
    }
    if (!byCat.has(cat)) byCat.set(cat, [])
    byCat.get(cat).push(tool)
    total++
  }
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const cats = [...byCat.keys()].sort()
for (const cat of cats) {
  const tools = byCat.get(cat).sort((a, b) => a.slug.localeCompare(b.slug))
  const body = tools.map((t) => `  httpTool(${JSON.stringify(t)}),`).join("\n")
  writeFileSync(
    join(OUT, `${cat}.ts`),
    `// AUTO-GENERATED from GitHub OpenAPI spec — do not edit. Regenerate: bun run gen:github\nimport { httpTool } from "../../core/index"\n\nexport const ${ident(cat)} = [\n${body}\n]\n`
  )
}
const imports = cats.map((c) => `import { ${ident(c)} } from "./${c}"`).join("\n")
const spread = cats.map((c) => `  ...${ident(c)},`).join("\n")
writeFileSync(
  join(OUT, "index.ts"),
  `// AUTO-GENERATED — do not edit. Regenerate: bun run gen:github\nimport type { ToolDef } from "../../core/index"\n${imports}\n\nexport const generatedTools: ToolDef[] = [\n${spread}\n]\n`
)

console.log(`generated ${total} tools across ${cats.length} categories`)
