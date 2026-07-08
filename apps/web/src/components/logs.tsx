import { useEffect, useState } from "react"
import { ScrollText } from "lucide-react"
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

type Execution = {
  id: string
  toolSlug: string
  toolkitSlug: string
  status: Extract<Status, "success" | "error">
  durationMs: number | null
  output: unknown
  createdAt: string
}

export function Logs() {
  const [rows, setRows] = useState<Execution[] | null>(null)

  useEffect(() => {
    api<Execution[]>("/api/executions").then(setRows).catch(() => setRows([]))
  }, [])

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Execution logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The last 50 tool executions across your connections.
        </p>
      </header>

      {rows === null ? (
        <div className="space-y-2 rounded-lg border border-border p-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No executions yet"
          hint="Run a tool through the API and it will show up here with timing and status."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Tool</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><code className="font-mono text-xs">{r.toolSlug}</code></TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {r.durationMs != null ? `${r.durationMs} ms` : "—"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{relativeTime(r.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
