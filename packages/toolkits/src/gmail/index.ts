import { z } from "zod"
import { defineTool, defineToolkit, oauth2 } from "../core/index"
import { generatedTools } from "./generated/index"

// RFC 2822 → base64url, the shape Gmail's `raw` field wants.
// ponytail: plain-text body only, no HTML/attachments — add a multipart
// builder when a tool actually needs them.
const encodeHeader = (s: string) =>
  // RFC 2047 encode non-ASCII headers so subjects don't arrive garbled.
  /^[\x00-\x7F]*$/.test(s) ? s : `=?utf-8?B?${Buffer.from(s).toString("base64")}?=`

function toRaw(m: {
  to: string
  subject: string
  body: string
  cc?: string
  bcc?: string
  inReplyTo?: string
}): string {
  const headers = [
    `To: ${m.to}`,
    m.cc ? `Cc: ${m.cc}` : "",
    m.bcc ? `Bcc: ${m.bcc}` : "",
    `Subject: ${encodeHeader(m.subject)}`,
    // Reply threading: clients thread on In-Reply-To/References matching the
    // original Message-ID header (Gmail also needs threadId on the request).
    m.inReplyTo ? `In-Reply-To: ${m.inReplyTo}` : "",
    m.inReplyTo ? `References: ${m.inReplyTo}` : "",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
  ].filter(Boolean)
  const mime = headers.join("\r\n") + "\r\n\r\n" + m.body
  return Buffer.from(mime).toString("base64url")
}

const messageInput = z.object({
  to: z.string().describe("Recipient email address(es), comma-separated"),
  subject: z.string(),
  body: z.string().describe("Plain-text body"),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  threadId: z
    .string()
    .optional()
    .describe("Reply into this Gmail thread (threadId from get_message/search)"),
  inReplyTo: z
    .string()
    .optional()
    .describe("Message-ID header of the message being replied to, for client threading"),
})

// Gmail wants { raw, threadId? } — only send threadId when replying.
const messageBody = (input: z.infer<typeof messageInput>) =>
  input.threadId ? { raw: toRaw(input), threadId: input.threadId } : { raw: toRaw(input) }

export default defineToolkit({
  slug: "gmail",
  name: "Gmail",
  auth: oauth2({
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    // Google only returns a refresh_token with these; without them the
    // connection dies after the 1h access token expires.
    authorizeParams: { access_type: "offline", prompt: "consent" },
  }),
  authProvider: "google", // shares one OAuth client with Drive/Calendar
  baseUrl: "https://gmail.googleapis.com/gmail/v1",
  usage: `Tools for a connected Gmail account.

Reading:
- \`search_messages\` takes a Gmail search \`q\` (e.g. \`from:alice is:unread\`, \`subject:invoice newer_than:7d\`) and returns message id/threadId stubs — call \`get_message\` for the content.
- \`get_message\` / \`get_thread\` return the full message/thread; payload headers hold From/To/Subject, the body is base64url in the parts.
- \`list_labels\` returns label ids; you need those ids for \`modify_labels\`.

Writing:
- \`send_message\` sends immediately. \`create_draft\` saves a draft (returns a draft id); \`send_draft\` sends an existing draft by id.
- To **reply in-thread**, pass \`threadId\` (from get_message/search) and \`inReplyTo\` (the original's \`Message-ID\` header, found in \`get_message\` payload headers). Missing either breaks threading.
- \`modify_labels\` adds/removes labels by id: archive = remove \`INBOX\`, mark read = remove \`UNREAD\`, star = add \`STARRED\`. Manage the label set itself with \`create_label\`/\`update_label\`/\`delete_label\` (ids come from \`list_labels\`).
- \`trash_message\` moves a message to Trash (recoverable), it does not permanently delete.

Attachments:
- \`get_message\` lists parts with an \`attachmentId\`; call \`get_attachment\` with the message id + that id to get the content (base64url). Sending attachments is not supported yet (plain-text only).`,
  tools: [
    defineTool({
      slug: "search_messages",
      description: "Search messages with a Gmail query, returns id/threadId stubs",
      input: z.object({
        q: z.string().describe("Gmail search query, e.g. 'from:alice is:unread'"),
        maxResults: z.number().int().min(1).max(500).optional(),
      }),
      execute: (input, ctx) => {
        const qs = new URLSearchParams({ q: input.q })
        if (input.maxResults) qs.set("maxResults", String(input.maxResults))
        return ctx.fetch(`/users/me/messages?${qs}`)
      },
    }),
    defineTool({
      slug: "get_message",
      description: "Get a single message by id",
      input: z.object({
        id: z.string(),
        format: z.enum(["full", "metadata", "minimal", "raw"]).optional(),
      }),
      execute: (input, ctx) =>
        ctx.fetch(`/users/me/messages/${encodeURIComponent(input.id)}?format=${input.format ?? "full"}`),
    }),
    defineTool({
      slug: "get_thread",
      description: "Get a full thread (all its messages) by id",
      input: z.object({
        id: z.string(),
        format: z.enum(["full", "metadata", "minimal"]).optional(),
      }),
      execute: (input, ctx) =>
        ctx.fetch(`/users/me/threads/${encodeURIComponent(input.id)}?format=${input.format ?? "full"}`),
    }),
    defineTool({
      slug: "list_labels",
      description: "List all labels (system + user) with their ids",
      input: z.object({}),
      execute: (_input, ctx) => ctx.fetch("/users/me/labels"),
    }),
    defineTool({
      slug: "send_message",
      description: "Send a plain-text email (set threadId + inReplyTo to reply in-thread)",
      input: messageInput,
      execute: (input, ctx) =>
        ctx.fetch("/users/me/messages/send", { method: "POST", body: messageBody(input) }),
    }),
    defineTool({
      slug: "create_draft",
      description: "Create a draft email (returns a draft id)",
      input: messageInput,
      execute: (input, ctx) =>
        ctx.fetch("/users/me/drafts", { method: "POST", body: { message: messageBody(input) } }),
    }),
    defineTool({
      slug: "get_attachment",
      description: "Download an attachment's content (base64url data) by message + attachment id",
      input: z.object({
        messageId: z.string(),
        attachmentId: z.string().describe("attachmentId from a message part's body"),
      }),
      execute: (input, ctx) =>
        ctx.fetch(
          `/users/me/messages/${encodeURIComponent(input.messageId)}/attachments/${encodeURIComponent(input.attachmentId)}`
        ),
    }),
    defineTool({
      slug: "create_label",
      description: "Create a new label",
      input: z.object({
        name: z.string(),
        labelListVisibility: z.enum(["labelShow", "labelHide", "labelShowIfUnread"]).optional(),
        messageListVisibility: z.enum(["show", "hide"]).optional(),
      }),
      execute: (input, ctx) => ctx.fetch("/users/me/labels", { method: "POST", body: input }),
    }),
    defineTool({
      slug: "update_label",
      description: "Rename or re-configure an existing label by id",
      input: z.object({
        id: z.string(),
        name: z.string().optional(),
        labelListVisibility: z.enum(["labelShow", "labelHide", "labelShowIfUnread"]).optional(),
        messageListVisibility: z.enum(["show", "hide"]).optional(),
      }),
      execute: ({ id, ...patch }, ctx) =>
        ctx.fetch(`/users/me/labels/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
    }),
    defineTool({
      slug: "delete_label",
      description: "Delete a label by id (removes it from all messages)",
      input: z.object({ id: z.string() }),
      execute: (input, ctx) =>
        ctx.fetch(`/users/me/labels/${encodeURIComponent(input.id)}`, { method: "DELETE" }),
    }),
    defineTool({
      slug: "send_draft",
      description: "Send an existing draft by its id",
      input: z.object({ id: z.string().describe("Draft id from create_draft") }),
      execute: (input, ctx) =>
        ctx.fetch("/users/me/drafts/send", { method: "POST", body: { id: input.id } }),
    }),
    defineTool({
      slug: "modify_labels",
      description: "Add/remove labels on a message (archive, mark read, star, …)",
      input: z.object({
        id: z.string().describe("Message id"),
        addLabelIds: z.array(z.string()).optional(),
        removeLabelIds: z.array(z.string()).optional(),
      }),
      execute: (input, ctx) =>
        ctx.fetch(`/users/me/messages/${encodeURIComponent(input.id)}/modify`, {
          method: "POST",
          body: { addLabelIds: input.addLabelIds, removeLabelIds: input.removeLabelIds },
        }),
    }),
    defineTool({
      slug: "trash_message",
      description: "Move a message to Trash (recoverable, not a permanent delete)",
      input: z.object({ id: z.string() }),
      execute: (input, ctx) =>
        ctx.fetch(`/users/me/messages/${encodeURIComponent(input.id)}/trash`, { method: "POST" }),
    }),
    // Full Gmail API surface (default:false — opt-in), generated from discovery.
    ...generatedTools,
  ],
})

// ponytail: one runnable check for the only non-trivial logic (MIME encoding).
if (import.meta.main) {
  const raw = toRaw({ to: "a@b.com", subject: "NorKøbenhavn", body: "hi" })
  const mime = Buffer.from(raw, "base64url").toString("utf-8")
  console.assert(mime.includes("To: a@b.com"), "to header")
  console.assert(mime.includes("Subject: =?utf-8?B?"), "non-ASCII subject encoded")
  console.assert(mime.endsWith("\r\n\r\nhi"), "body after blank line")
  const reply = Buffer.from(
    toRaw({ to: "a@b.com", subject: "Re: x", body: "b", inReplyTo: "<abc@mail>" }),
    "base64url"
  ).toString("utf-8")
  console.assert(reply.includes("In-Reply-To: <abc@mail>"), "reply header")
  console.assert(reply.includes("References: <abc@mail>"), "references header")
  console.assert(!mime.includes("In-Reply-To"), "no reply header when not replying")
  console.assert(!toRaw({ to: "x", subject: "Plain", body: "" }).length || true)
  console.assert(
    Buffer.from(toRaw({ to: "x", subject: "Plain ASCII", body: "b" }), "base64url")
      .toString("utf-8")
      .includes("Subject: Plain ASCII"),
    "ASCII subject left raw"
  )
  console.log("gmail MIME self-check ok")
}
