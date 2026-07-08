// AUTO-GENERATED — do not edit. Regenerate: bun run gen:google
import type { ToolDef } from "../../core/index"
import { attachments } from "./attachments"
import { delegates } from "./delegates"
import { drafts } from "./drafts"
import { filters } from "./filters"
import { forwardingAddresses } from "./forwardingAddresses"
import { history } from "./history"
import { identities } from "./identities"
import { keypairs } from "./keypairs"
import { labels } from "./labels"
import { messages } from "./messages"
import { sendAs } from "./sendAs"
import { settings } from "./settings"
import { smimeInfo } from "./smimeInfo"
import { threads } from "./threads"
import { users } from "./users"

export const generatedTools: ToolDef[] = [
  ...attachments,
  ...delegates,
  ...drafts,
  ...filters,
  ...forwardingAddresses,
  ...history,
  ...identities,
  ...keypairs,
  ...labels,
  ...messages,
  ...sendAs,
  ...settings,
  ...smimeInfo,
  ...threads,
  ...users,
]
