import { z } from "zod"
import { defineTool, defineToolkit, oauth2 } from "../core/index"

export default defineToolkit({
  slug: "slack",
  name: "Slack",
  auth: oauth2({
    authorizationUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["chat:write", "channels:read"],
  }),
  baseUrl: "https://slack.com/api",
  usage: `Use these tools to read channels and post messages to a connected Slack workspace.

When to use:
- \`send_message\` posts to a channel. The \`channel\` can be a channel ID (e.g. \`C0123ABC\`, preferred) or a name like \`#general\`. Resolve the ID with \`list_channels\` when unsure.
- \`list_channels\` returns public channels; use it to discover the right \`channel\` before posting.

Conventions:
- Slack returns HTTP 200 even on logical failures — check the \`ok\` field in the response; if \`ok\` is false, read \`error\` (e.g. \`channel_not_found\`, \`not_in_channel\`) and fix the input rather than retrying blindly.
- Keep message \`text\` concise; Slack renders mrkdwn.`,
  tools: [
    defineTool({
      slug: "send_message",
      description: "Post a message to a Slack channel",
      input: z.object({
        channel: z.string().describe("Channel ID or name, e.g. C0123 or #general"),
        text: z.string(),
      }),
      execute: (input, ctx) =>
        ctx.fetch("/chat.postMessage", {
          method: "POST",
          body: { channel: input.channel, text: input.text },
        }),
    }),
    defineTool({
      slug: "list_channels",
      description: "List public channels in the workspace",
      input: z.object({
        limit: z.number().int().min(1).max(1000).optional(),
      }),
      execute: (input, ctx) =>
        ctx.fetch(`/conversations.list?limit=${input.limit ?? 100}`),
    }),
  ],
})
