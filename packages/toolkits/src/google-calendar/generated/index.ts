// AUTO-GENERATED — do not edit. Regenerate: bun run gen:google
import type { ToolDef } from "../../core/index"
import { acl } from "./acl"
import { calendarList } from "./calendarList"
import { calendars } from "./calendars"
import { channels } from "./channels"
import { colors } from "./colors"
import { events } from "./events"
import { freebusy } from "./freebusy"
import { settings } from "./settings"

export const generatedTools: ToolDef[] = [
  ...acl,
  ...calendarList,
  ...calendars,
  ...channels,
  ...colors,
  ...events,
  ...freebusy,
  ...settings,
]
