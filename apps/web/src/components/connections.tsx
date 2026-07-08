import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Plug, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { api } from "@/lib/api"
import { relativeTime } from "@/lib/format"
import { StatusBadge, type Status } from "@/components/status"
import { EmptyState } from "@/components/empty-state"

type Connection = {
  id: string
  authConfigId: string
  toolkitSlug: string
  status: Status
  expiresAt: string | null
  createdAt: string
}

export function Connections() {
  const [rows, setRows] = useState<Connection[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    api<Connection[]>("/api/connections").then(setRows).catch(() => setRows([]))
  }, [])
  useEffect(load, [load])

  async function disconnect(c: Connection) {
    setBusy(c.id)
    try {
      await api(`/api/connections/${c.id}`, { method: "DELETE" })
      toast.success(`Disconnected ${c.toolkitSlug}`)
      load()
    } catch (e) {
      toast.error(String((e as Error).message))
    } finally {
      setBusy(null)
    }
  }

  async function reconnect(c: Connection) {
    setBusy(c.id)
    try {
      const res = await api<{ redirectUrl?: string }>("/api/connections", {
        method: "POST",
        body: JSON.stringify({ authConfigId: c.authConfigId }),
      })
      if (res.redirectUrl) return void (window.location.href = res.redirectUrl)
      toast.success(`Reconnected ${c.toolkitSlug}`)
      load()
    } catch (e) {
      toast.error(String((e as Error).message))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Connections</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connected accounts your tools run against.
        </p>
      </header>

      {rows === null ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="No connections yet"
          hint="Connect a service from the Catalog to start running its tools."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Toolkit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Connected</TableHead>
                <TableHead className="font-mono">ID</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.toolkitSlug}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-muted-foreground">{relativeTime(r.createdAt)}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy === r.id}
                        onClick={() => reconnect(r)}
                      >
                        {busy === r.id ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                        Reconnect
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={busy === r.id}
                        aria-label={`Disconnect ${r.toolkitSlug}`}
                        onClick={() => disconnect(r)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-2 rounded-lg border border-border p-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  )
}
