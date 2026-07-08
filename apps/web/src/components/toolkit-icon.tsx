import type { IconType } from "react-icons"
import { SiGithub, SiGmail, SiGooglecalendar, SiGoogledrive } from "react-icons/si"
import { FaSlack } from "react-icons/fa6"
import { cn } from "@workspace/ui/lib/utils"

// slug → brand glyph. Monochrome (currentColor) so it stays theme-safe.
// Add an integration = add a line here; unknown slugs fall back to the initial.
const ICONS: Record<string, IconType> = {
  github: SiGithub,
  gmail: SiGmail,
  slack: FaSlack,
  "google-calendar": SiGooglecalendar,
  "google-drive": SiGoogledrive,
}

export function ToolkitIcon({
  slug,
  name,
  className,
}: {
  slug: string
  name: string
  className?: string
}) {
  const Icon = ICONS[slug]
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-md border border-border bg-muted",
        className
      )}
    >
      {Icon ? <Icon className="size-5" /> : <span className="text-sm font-semibold">{name[0]}</span>}
    </span>
  )
}
