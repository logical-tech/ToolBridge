import type { ToolkitDef } from "./core/index"
import github from "./github/index"
import gmail from "./gmail/index"
import googleCalendar from "./google-calendar/index"
import googleDrive from "./google-drive/index"
import slack from "./slack/index"

// Static registry. Add an integration = add a file + one line here.
export const toolkits: Record<string, ToolkitDef> = {
  [github.slug]: github,
  [gmail.slug]: gmail,
  [googleCalendar.slug]: googleCalendar,
  [googleDrive.slug]: googleDrive,
  [slack.slug]: slack,
}
