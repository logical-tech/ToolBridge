import { cn } from "@workspace/ui/lib/utils"

export type Status = "active" | "pending" | "expired" | "error" | "success"

// Single source of truth for how a connection/execution state reads.
const config: Record<Status, { label: string; dot: string; text: string }> = {
  active: { label: "Active", dot: "bg-success", text: "text-success" },
  success: { label: "Success", dot: "bg-success", text: "text-success" },
  pending: { label: "Pending", dot: "bg-warning", text: "text-warning" },
  expired: { label: "Expired", dot: "bg-muted-foreground", text: "text-muted-foreground" },
  error: { label: "Error", dot: "bg-destructive", text: "text-destructive" },
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const c = config[status] ?? config.error
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        c.text,
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", c.dot)} aria-hidden />
      {c.label}
    </span>
  )
}
