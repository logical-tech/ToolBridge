import { Hono } from "hono"
import { cors } from "hono/cors"
import { syncSchema } from "./db/sync"
import { auth } from "./auth"
import { toolkitsRoute } from "./routes/toolkits"
import { authConfigsRoute } from "./routes/auth-configs"
import { connectionsRoute } from "./routes/connections"
import { toolsRoute } from "./routes/tools"
import { executionsRoute } from "./routes/executions"
import { webhooksRoute } from "./routes/webhooks"
import { triggersRoute } from "./routes/triggers"

// Keep the DB schema in sync before serving. A failure here (e.g. DB down)
// is logged but doesn't stop the API from booting.
try {
  await syncSchema()
} catch (err) {
  console.error("[db] schema sync failed:", err)
}

const app = new Hono()

app.use(
  "*",
  cors({
    origin: process.env.WEB_URL ?? "http://localhost:5173",
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
)

app.get("/health", (c) => c.json({ status: "ok" }))

// Better Auth: session (dashboard) + apiKey (programmatic) endpoints
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))

app.route("/api/toolkits", toolkitsRoute)
app.route("/api/auth-configs", authConfigsRoute)
app.route("/api/connections", connectionsRoute)
app.route("/api/tools", toolsRoute)
app.route("/api/executions", executionsRoute)
app.route("/api/webhooks", webhooksRoute)
app.route("/api/triggers", triggersRoute)

const port = Number(process.env.PORT ?? 3000)
console.log(`Tool Bridge API on http://localhost:${port}`)

export default { port, fetch: app.fetch }
