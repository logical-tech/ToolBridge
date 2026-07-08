import { useCallback, useEffect, useState } from "react"
import { ChevronRight } from "lucide-react"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import { api } from "@/lib/api"
import { IntegrationDetail } from "@/components/integration-detail"
import { ToolkitIcon } from "@/components/toolkit-icon"

type Toolkit = {
  slug: string
  name: string
  authType: string
  authTypes?: string[]
  toolCount: number
}

export function Catalog() {
  const [toolkits, setToolkits] = useState<Toolkit[] | null>(null)
  const [connected, setConnected] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Toolkit | null>(null)
  const [rendered, setRendered] = useState<Toolkit | null>(null) // stays mounted during close

  const loadConnections = useCallback(() => {
    api<{ toolkitSlug: string }[]>("/api/connections")
      .then((cs) => setConnected(new Set(cs.map((c) => c.toolkitSlug))))
      .catch(() => {})
  }, [])

  useEffect(() => {
    api<Toolkit[]>("/api/toolkits").then(setToolkits).catch(() => setToolkits([]))
    loadConnections()
  }, [loadConnections])

  useEffect(() => {
    if (selected) setRendered(selected)
  }, [selected])

  const open = selected !== null

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect a service, then expose its tools to your agents.
        </p>
      </header>

      <div className="flex gap-6">
        <div
          className={cn(
            "min-w-0 transition-all duration-300 ease-out",
            open ? "hidden lg:block lg:flex-1" : "flex-1"
          )}
        >
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
            {toolkits === null
              ? Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)
              : toolkits.map((t) => (
                  <ToolkitCard
                    key={t.slug}
                    toolkit={t}
                    connected={connected.has(t.slug)}
                    selected={selected?.slug === t.slug}
                    onClick={() => setSelected(t)}
                  />
                ))}
          </div>
        </div>

        <div
          className={cn(
            "shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-out",
            open ? "w-full opacity-100 lg:w-[560px]" : "w-0 opacity-0"
          )}
          onTransitionEnd={() => {
            if (!open) setRendered(null)
          }}
        >
          {rendered && (
            <div className="w-full lg:w-[560px]">
              <IntegrationDetail
                key={rendered.slug}
                slug={rendered.slug}
                name={rendered.name}
                connected={connected.has(rendered.slug)}
                onClose={() => setSelected(null)}
                onConnected={loadConnections}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ToolkitCard({
  toolkit,
  connected,
  selected,
  onClick,
}: {
  toolkit: Toolkit
  connected: boolean
  selected: boolean
  onClick: () => void
}) {
  const authTypes = toolkit.authTypes ?? [toolkit.authType]
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex items-start gap-3 rounded-lg border bg-card p-4 text-left transition-colors",
        selected
          ? "border-primary ring-1 ring-primary"
          : "border-border hover:border-foreground/15"
      )}
    >
      <ToolkitIcon slug={toolkit.slug} name={toolkit.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold">{toolkit.name}</h3>
          {connected && <span className="size-1.5 shrink-0 rounded-full bg-success" title="Connected" />}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{toolkit.toolCount} tools</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {authTypes.map((a) => (
            <code key={a} className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {a}
            </code>
          ))}
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

function CardSkeleton() {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-card p-4">
      <Skeleton className="size-9 rounded-md" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  )
}
