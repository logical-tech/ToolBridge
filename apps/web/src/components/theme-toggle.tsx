import { Monitor, Moon, Sun } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { useTheme } from "@/components/theme-provider"

const order = ["system", "light", "dark"] as const
const icon = { system: Monitor, light: Sun, dark: Moon }

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const current = (["system", "light", "dark"].includes(theme) ? theme : "system") as
    | "system"
    | "light"
    | "dark"
  const Icon = icon[current]

  function cycle() {
    const next = order[(order.indexOf(current) + 1) % order.length]
    setTheme(next)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycle}
      aria-label={`Theme: ${current}. Click to change.`}
      title={`Theme: ${current}`}
      className="text-muted-foreground hover:text-foreground"
    >
      <Icon className="size-4" />
    </Button>
  )
}
