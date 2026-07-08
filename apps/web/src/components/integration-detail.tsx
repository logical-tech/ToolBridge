import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Check, Loader2, Plus, RotateCcw, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Switch } from "@workspace/ui/components/switch"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { api, API_URL } from "@/lib/api"
import { ToolkitIcon } from "@/components/toolkit-icon"

type Detail = {
  slug: string
  name: string
  authType: string
  authTypes: string[]
  authProvider: string | null
  baseUrl: string
  hasWebhooks: boolean
  usage: string | null
  toolCount: number
}

type Tool = {
  slug: string
  description: string
  default: boolean
  inputSchema: { properties?: Record<string, { type?: string; description?: string }>; required?: string[] }
}

export function IntegrationDetail({
  slug,
  name,
  connected,
  onClose,
  onConnected,
}: {
  slug: string
  name: string
  connected: boolean
  onClose: () => void
  onConnected: () => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [tools, setTools] = useState<Tool[] | null>(null)

  useEffect(() => {
    setDetail(null)
    setTools(null)
    api<Detail>(`/api/toolkits/${slug}`).then(setDetail).catch(() => {})
    api<Tool[]>(`/api/toolkits/${slug}/tools`).then(setTools).catch(() => setTools([]))
  }, [slug])

  return (
    <div className="flex h-[calc(100svh-8.5rem)] flex-col overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex items-center gap-3 border-b border-border p-4">
        <ToolkitIcon slug={slug} name={name} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{name}</h2>
          <p className="text-xs text-muted-foreground">
            {connected ? (
              <span className="inline-flex items-center gap-1 text-success">
                <span className="size-1.5 rounded-full bg-success" /> Connected
              </span>
            ) : (
              "Not connected"
            )}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
          <X className="size-4" />
        </Button>
      </header>

      <Tabs defaultValue="details" className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-4">
          <TabsList className="h-auto bg-transparent p-0">
            {[
              ["details", "Details"],
              ["tools", "Tools"],
              ["usage", "Usage"],
            ].map(([v, label]) => (
              <TabsTrigger
                key={v}
                value={v}
                className="rounded-none border-b-2 border-transparent bg-transparent px-3 py-2.5 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <TabsContent value="details" className="mt-0">
            <DetailsTab detail={detail} slug={slug} name={name} connected={connected} onConnected={onConnected} />
          </TabsContent>
          <TabsContent value="tools" className="mt-0">
            <ToolsTab tools={tools} slug={slug} />
          </TabsContent>
          <TabsContent value="usage" className="mt-0">
            <UsageTab detail={detail} tools={tools} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}

function DetailsTab({
  detail,
  slug,
  name,
  connected,
  onConnected,
}: {
  detail: Detail | null
  slug: string
  name: string
  connected: boolean
  onConnected: () => void
}) {
  const [connecting, setConnecting] = useState(false)

  if (!detail) return <Skeleton className="h-40 w-full" />

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border">
        <div className="px-3">
          <Row label="Auth methods">
            <span className="flex flex-wrap justify-end gap-1">
              {detail.authTypes.map((a) => (
                <code key={a} className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {a}
                </code>
              ))}
            </span>
          </Row>
          <Row label="Base URL"><code className="font-mono text-xs">{detail.baseUrl}</code></Row>
          <Row label="Tools">{detail.toolCount}</Row>
          <Row label="Webhooks">{detail.hasWebhooks ? "Supported" : "—"}</Row>
        </div>
      </div>

      {connecting ? (
        <ConnectForm slug={slug} name={name} authType={detail.authType} authProvider={detail.authProvider} onDone={() => setConnecting(false)} onConnected={onConnected} />
      ) : (
        <Button variant={connected ? "outline" : "default"} onClick={() => setConnecting(true)}>
          {connected ? <Check className="size-4" /> : <Plus className="size-4" />}
          {connected ? "Reconnect" : "Connect"}
        </Button>
      )}
    </div>
  )
}

function ToolsTab({ tools, slug }: { tools: Tool[] | null; slug: string }) {
  const [enabled, setEnabled] = useState<Set<string> | null>(null)
  const [isDefault, setIsDefault] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setEnabled(null)
    api<{ enabled: string[]; isDefault: boolean }>(`/api/toolkits/${slug}/preferences`)
      .then((p) => {
        setEnabled(new Set(p.enabled))
        setIsDefault(p.isDefault)
      })
      .catch(() => setEnabled(new Set()))
  }, [slug])

  async function persist(next: Set<string>) {
    setEnabled(new Set(next)) // optimistic
    setBusy(true)
    try {
      const res = await api<{ isDefault: boolean }>(`/api/toolkits/${slug}/preferences`, {
        method: "PUT",
        body: JSON.stringify({ enabled: [...next] }),
      })
      setIsDefault(res.isDefault)
    } catch (err) {
      toast.error(`Couldn't save: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  function toggle(toolSlug: string) {
    if (!enabled) return
    const next = new Set(enabled)
    next.has(toolSlug) ? next.delete(toolSlug) : next.add(toolSlug)
    void persist(next)
  }

  async function reset() {
    setBusy(true)
    try {
      const res = await api<{ enabled: string[]; isDefault: boolean }>(
        `/api/toolkits/${slug}/preferences`,
        { method: "DELETE" }
      )
      setEnabled(new Set(res.enabled))
      setIsDefault(res.isDefault)
      toast.success("Reset to essential tools")
    } catch (err) {
      toast.error(`Couldn't reset: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  if (tools === null || enabled === null)
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    )

  const allOn = enabled.size === tools.length
  const allOff = enabled.size === 0

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{enabled.size}</span> of {tools.length}{" "}
          exposed to AI
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={busy || allOn}
            onClick={() => persist(new Set(tools.map((t) => t.slug)))}
          >
            Enable all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={busy || allOff}
            onClick={() => persist(new Set())}
          >
            Disable all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={busy || isDefault}
            onClick={reset}
            title="Reset to the essential tool set"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {tools.map((t) => {
          const params = Object.entries(t.inputSchema?.properties ?? {})
          const required = new Set(t.inputSchema?.required ?? [])
          const on = enabled.has(t.slug)
          return (
            <li key={t.slug} className="flex items-start gap-3 py-3 first:pt-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs font-medium">{t.slug}</code>
                  {t.default && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      essential
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                {params.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {params.map(([k]) => (
                      <span key={k} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {k}
                        {required.has(k) && <span className="text-destructive">*</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Switch
                checked={on}
                onCheckedChange={() => toggle(t.slug)}
                disabled={busy}
                aria-label={`Expose ${t.slug} to AI`}
                className="mt-0.5 shrink-0"
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function UsageTab({ detail, tools }: { detail: Detail | null; tools: Tool[] | null }) {
  if (!detail) return <Skeleton className="h-40 w-full" />
  const example = tools?.[0]?.slug ?? "<tool>"
  return (
    <div className="space-y-5 text-sm">
      {detail.usage ? (
        <p className="whitespace-pre-wrap leading-relaxed text-foreground/90">{detail.usage}</p>
      ) : (
        <p className="text-muted-foreground">No usage notes for this integration yet.</p>
      )}

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Calling a tool
        </p>
        <pre className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
{`POST ${API_URL}/api/tools/${detail.slug}/${example}/execute
Authorization: x-api-key <key>   (or session cookie)
Content-Type: application/json

{
  "connectedAccountId": "<optional>",
  "arguments": { /* tool input */ }
}`}
        </pre>
        <p className="mt-2 text-xs text-muted-foreground">
          Omit <code className="font-mono">connectedAccountId</code> to use your only active
          connection for this toolkit. The response is{" "}
          <code className="font-mono">{`{ status, output }`}</code>.
        </p>
      </div>
    </div>
  )
}

function ConnectForm({
  slug,
  name,
  authType,
  authProvider,
  onDone,
  onConnected,
}: {
  slug: string
  name: string
  authType: string
  authProvider: string | null
  onDone: () => void
  onConnected: () => void
}) {
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // An existing credential from a sibling provider (e.g. another Google app)
  // that this toolkit can reuse — set the client once, authorize the rest.
  const [reuse, setReuse] = useState<{ id: string; clientId: string } | null>(null)
  const [useManual, setUseManual] = useState(false)
  const isOAuth = authType === "oauth2"

  useEffect(() => {
    if (!authProvider) return
    Promise.all([
      api<{ id: string; toolkitSlug: string; clientId: string | null }[]>("/api/auth-configs"),
      api<{ slug: string; authProvider: string | null }[]>("/api/toolkits"),
    ])
      .then(([configs, toolkits]) => {
        const providerOf = new Map(toolkits.map((t) => [t.slug, t.authProvider]))
        const match = configs.find(
          (c) => c.clientId && providerOf.get(c.toolkitSlug) === authProvider
        )
        if (match?.clientId) setReuse({ id: match.id, clientId: match.clientId })
      })
      .catch(() => {})
  }, [authProvider])

  async function connectWith(authConfigId: string) {
    const res = await api<{ redirectUrl?: string }>("/api/connections", {
      method: "POST",
      body: JSON.stringify({ authConfigId, toolkitSlug: slug, apiKey: apiKey || undefined }),
    })
    if (res.redirectUrl) return void (window.location.href = res.redirectUrl)
    toast.success(`${name} connected`)
    onConnected()
    onDone()
  }

  async function reuseConnect() {
    setError(null)
    setBusy(true)
    try {
      await connectWith(reuse!.id)
    } catch (err) {
      setError(String((err as Error).message))
      setBusy(false)
    }
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const cfg = await api<{ id: string }>("/api/auth-configs", {
        method: "POST",
        body: JSON.stringify({
          toolkitSlug: slug,
          clientId: clientId || undefined,
          clientSecret: clientSecret || undefined,
          webhookSecret: webhookSecret || undefined,
        }),
      })
      if (webhookSecret) console.info(`Webhook URL: ${API_URL}/api/webhooks/${slug}/${cfg.id}`)
      await connectWith(cfg.id)
    } catch (err) {
      setError(String((err as Error).message))
      setBusy(false)
    }
  }

  // Reuse path: a sibling provider credential exists → skip the client id/secret.
  if (reuse && !useManual) {
    return (
      <div className="space-y-3 rounded-lg border border-border p-3">
        <p className="text-xs text-muted-foreground">
          Reusing existing credentials
          <code className="ml-1 font-mono">…{reuse.clientId.slice(-12)}</code>. Just authorize
          {" "}
          {name} with Google.
        </p>
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={reuseConnect}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Authorize
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setUseManual(true)}>
            Use different credentials
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={connect} className="space-y-3 rounded-lg border border-border p-3">
      {isOAuth ? (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="cid" className="text-xs">Client ID</Label>
            <Input id="cid" value={clientId} onChange={(e) => setClientId(e.target.value)} required className="h-8" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="csec" className="text-xs">Client Secret</Label>
            <Input id="csec" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} required className="h-8" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="wh" className="text-xs text-muted-foreground">Webhook Secret (optional)</Label>
            <Input id="wh" type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} className="h-8" />
          </div>
        </>
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor="ak" className="text-xs">API Key</Label>
          <Input id="ak" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required className="h-8" />
        </div>
      )}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {isOAuth ? "Authorize" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}
