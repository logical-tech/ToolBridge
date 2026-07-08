import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Blocks, LogOut, Plug, Radio, ScrollText, Waypoints } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { authClient } from "@/lib/auth-client"
import { AuthForm } from "@/components/auth-form"
import { Catalog } from "@/components/catalog"
import { Connections } from "@/components/connections"
import { Logs } from "@/components/logs"
import { Triggers } from "@/components/triggers"
import { ThemeToggle } from "@/components/theme-toggle"

const NAV = [
  { id: "catalog", label: "Catalog", icon: Blocks, El: Catalog },
  { id: "connections", label: "Connections", icon: Plug, El: Connections },
  { id: "triggers", label: "Triggers", icon: Radio, El: Triggers },
  { id: "logs", label: "Logs", icon: ScrollText, El: Logs },
] as const

export function App() {
  const { data: session, isPending } = authClient.useSession()
  const [tab, setTab] = useState<(typeof NAV)[number]["id"]>("catalog")

  // After the OAuth callback redirects back with ?connected=<slug>, confirm + land on Connections.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("connected")
    if (!slug) return
    toast.success(`${slug} connected`)
    setTab("connections")
    window.history.replaceState({}, "", window.location.pathname)
  }, [])

  if (isPending) return <div className="min-h-svh bg-background" />
  if (!session) return <AuthForm />

  const Active = NAV.find((n) => n.id === tab)!.El

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
              <Waypoints className="size-3.5" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Tool Bridge</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-2 hidden text-xs text-muted-foreground sm:inline">
              {session.user.email}
            </span>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Sign out"
              title="Sign out"
              onClick={() => authClient.signOut()}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 px-4">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors",
                "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors",
                tab === id
                  ? "text-foreground after:bg-primary"
                  : "text-muted-foreground hover:text-foreground after:bg-transparent"
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div key={tab} className="animate-in fade-in-0 duration-200">
          <Active />
        </div>
      </main>
    </div>
  )
}
