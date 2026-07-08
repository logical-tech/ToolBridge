import { useEffect, useState } from "react"
import { Radio } from "lucide-react"
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
import { EmptyState } from "@/components/empty-state"

type TriggerEvent = {
  id: string
  toolkitSlug: string
  eventType: string
  createdAt: string
}

export function Triggers() {
  const [rows, setRows] = useState<TriggerEvent[] | null>(null)

  useEffect(() => {
    api<TriggerEvent[]>("/api/triggers/events").then(setRows).catch(() => setRows([]))
  }, [])

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Triggers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Incoming webhook events from your connected services.
        </p>
      </header>

      {rows === null ? (
        <div className="space-y-2 rounded-lg border border-border p-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="No trigger events yet"
          hint="Add a webhook secret when connecting a service, then point its webhook at Tool Bridge."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Toolkit</TableHead>
                <TableHead>Event</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.toolkitSlug}</TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{r.eventType}</code>
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
