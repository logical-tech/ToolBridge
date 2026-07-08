import { z } from "zod"
import { defineTool, defineToolkit, oauth2 } from "../core/index"
import { generatedTools } from "./generated/index"

// Fields worth returning for a file — Drive returns a sparse set by default.
const FILE_FIELDS = "id,name,mimeType,size,parents,modifiedTime,webViewLink,trashed"

// Uploads go to a separate host and want a multipart/related body (metadata
// part + media part). ponytail: fine for normal files; large files would need
// the resumable upload protocol instead.
function multipartBody(
  meta: Record<string, unknown>,
  content: string,
  mediaType: string,
  base64: boolean
): { boundary: string; body: string } {
  const boundary = `tb_${crypto.randomUUID()}`
  const transferEnc = base64 ? "\r\nContent-Transfer-Encoding: base64" : ""
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: ${mediaType}${transferEnc}\r\n\r\n${content}\r\n--${boundary}--`
  return { boundary, body }
}

export default defineToolkit({
  slug: "google-drive",
  name: "Google Drive",
  auth: oauth2({
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    // ponytail: full-drive scope keeps every tool working; narrow to
    // drive.file/readonly per deployment if least-privilege matters.
    scopes: ["https://www.googleapis.com/auth/drive"],
    authorizeParams: { access_type: "offline", prompt: "consent" },
  }),
  authProvider: "google",
  baseUrl: "https://www.googleapis.com/drive/v3",
  usage: `Tools for a connected Google Drive.

Finding & reading:
- \`search_files\` takes a Drive \`q\` (e.g. \`name contains 'report'\`, \`mimeType='application/pdf'\`, \`'FOLDER_ID' in parents\`, \`trashed=false\`) and returns file metadata.
- \`get_file\` returns one file's metadata by id.
- \`download_file\` returns raw bytes for binary/text files. Native Google files (Docs/Sheets/Slides) can't be downloaded — use \`export_file\` with a target mimeType (e.g. \`application/pdf\`, \`text/plain\`, \`text/csv\`).

Organizing:
- \`create_folder\` makes a folder (optionally under \`parentId\`). \`copy_file\` duplicates a file.
- \`update_file\` renames (\`name\`) or moves it (\`addParents\`/\`removeParents\` with folder ids).
- \`upload_file\` creates a file with content (text, or base64 for binary — set \`base64: true\`).
- \`share_file\` grants access (role \`reader|writer|commenter|owner\`, type \`user|group|domain|anyone\`). \`list_permissions\` shows who has access; \`delete_permission\` revokes one by id.
- \`trash_file\` moves to Trash (recoverable). \`delete_file\` is permanent — prefer trash.`,
  tools: [
    defineTool({
      slug: "search_files",
      description: "Search/list files with a Drive query",
      input: z.object({
        q: z.string().optional().describe("Drive query, e.g. \"name contains 'x' and trashed=false\""),
        pageSize: z.number().int().min(1).max(1000).optional(),
        pageToken: z.string().optional(),
        orderBy: z.string().optional().describe("e.g. 'modifiedTime desc'"),
      }),
      execute: (input, ctx) => {
        const qs = new URLSearchParams({ fields: `nextPageToken,files(${FILE_FIELDS})` })
        if (input.q) qs.set("q", input.q)
        if (input.pageSize) qs.set("pageSize", String(input.pageSize))
        if (input.pageToken) qs.set("pageToken", input.pageToken)
        if (input.orderBy) qs.set("orderBy", input.orderBy)
        return ctx.fetch(`/files?${qs}`)
      },
    }),
    defineTool({
      slug: "get_file",
      description: "Get a file's metadata by id",
      input: z.object({ fileId: z.string() }),
      execute: (input, ctx) =>
        ctx.fetch(`/files/${encodeURIComponent(input.fileId)}?fields=${FILE_FIELDS}`),
    }),
    defineTool({
      slug: "download_file",
      description: "Download raw file content (binary/text; not native Google Docs — use export_file)",
      input: z.object({ fileId: z.string() }),
      execute: (input, ctx) => ctx.fetch(`/files/${encodeURIComponent(input.fileId)}?alt=media`),
    }),
    defineTool({
      slug: "export_file",
      description: "Export a native Google Doc/Sheet/Slide to a given mimeType",
      input: z.object({
        fileId: z.string(),
        mimeType: z.string().describe("e.g. application/pdf, text/plain, text/csv"),
      }),
      execute: (input, ctx) =>
        ctx.fetch(
          `/files/${encodeURIComponent(input.fileId)}/export?mimeType=${encodeURIComponent(input.mimeType)}`
        ),
    }),
    defineTool({
      slug: "create_folder",
      description: "Create a folder (optionally inside a parent folder)",
      input: z.object({
        name: z.string(),
        parentId: z.string().optional(),
      }),
      execute: (input, ctx) =>
        ctx.fetch("/files", {
          method: "POST",
          body: {
            name: input.name,
            mimeType: "application/vnd.google-apps.folder",
            ...(input.parentId ? { parents: [input.parentId] } : {}),
          },
        }),
    }),
    defineTool({
      slug: "copy_file",
      description: "Copy a file (optionally rename the copy)",
      input: z.object({ fileId: z.string(), name: z.string().optional() }),
      execute: (input, ctx) =>
        ctx.fetch(`/files/${encodeURIComponent(input.fileId)}/copy`, {
          method: "POST",
          body: input.name ? { name: input.name } : {},
        }),
    }),
    defineTool({
      slug: "update_file",
      description: "Rename a file or move it between folders",
      input: z.object({
        fileId: z.string(),
        name: z.string().optional(),
        addParents: z.string().optional().describe("Folder id(s) to move into, comma-separated"),
        removeParents: z.string().optional().describe("Folder id(s) to move out of"),
      }),
      execute: (input, ctx) => {
        const qs = new URLSearchParams()
        if (input.addParents) qs.set("addParents", input.addParents)
        if (input.removeParents) qs.set("removeParents", input.removeParents)
        const suffix = qs.toString() ? `?${qs}` : ""
        return ctx.fetch(`/files/${encodeURIComponent(input.fileId)}${suffix}`, {
          method: "PATCH",
          body: input.name ? { name: input.name } : {},
        })
      },
    }),
    defineTool({
      slug: "upload_file",
      description: "Create a file with content (text, or base64 for binary)",
      input: z.object({
        name: z.string(),
        content: z.string().describe("File content — UTF-8 text, or base64 if base64=true"),
        mimeType: z.string().optional().describe("Defaults to text/plain"),
        parentId: z.string().optional().describe("Folder to create the file in"),
        base64: z.boolean().optional().describe("Set true when content is base64-encoded binary"),
      }),
      execute: (input, ctx) => {
        const mediaType = input.mimeType ?? "text/plain"
        const meta = {
          name: input.name,
          mimeType: input.mimeType,
          ...(input.parentId ? { parents: [input.parentId] } : {}),
        }
        const { boundary, body } = multipartBody(meta, input.content, mediaType, input.base64 ?? false)
        return ctx.fetch(
          `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${FILE_FIELDS}`,
          {
            method: "POST",
            headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
            body,
          }
        )
      },
    }),
    defineTool({
      slug: "share_file",
      description: "Grant a permission on a file",
      input: z.object({
        fileId: z.string(),
        role: z.enum(["reader", "commenter", "writer", "owner"]),
        type: z.enum(["user", "group", "domain", "anyone"]),
        emailAddress: z.string().optional().describe("Required for type user/group"),
        domain: z.string().optional().describe("Required for type domain"),
      }),
      execute: ({ fileId, ...body }, ctx) =>
        ctx.fetch(`/files/${encodeURIComponent(fileId)}/permissions`, { method: "POST", body }),
    }),
    defineTool({
      slug: "list_permissions",
      description: "List who has access to a file",
      input: z.object({ fileId: z.string() }),
      execute: (input, ctx) =>
        ctx.fetch(
          `/files/${encodeURIComponent(input.fileId)}/permissions?fields=permissions(id,type,role,emailAddress,domain,displayName)`
        ),
    }),
    defineTool({
      slug: "delete_permission",
      description: "Revoke a permission from a file by permission id (from list_permissions)",
      input: z.object({ fileId: z.string(), permissionId: z.string() }),
      execute: (input, ctx) =>
        ctx.fetch(
          `/files/${encodeURIComponent(input.fileId)}/permissions/${encodeURIComponent(input.permissionId)}`,
          { method: "DELETE" }
        ),
    }),
    defineTool({
      slug: "trash_file",
      description: "Move a file to Trash (recoverable)",
      input: z.object({ fileId: z.string() }),
      execute: (input, ctx) =>
        ctx.fetch(`/files/${encodeURIComponent(input.fileId)}`, {
          method: "PATCH",
          body: { trashed: true },
        }),
    }),
    defineTool({
      slug: "delete_file",
      description: "Permanently delete a file (not recoverable — prefer trash_file)",
      input: z.object({ fileId: z.string() }),
      execute: (input, ctx) =>
        ctx.fetch(`/files/${encodeURIComponent(input.fileId)}`, { method: "DELETE" }),
    }),
    // Full Drive API surface (default:false — opt-in), generated from discovery.
    ...generatedTools,
  ],
})

// ponytail: one runnable check for the non-trivial multipart builder.
if (import.meta.main) {
  const { boundary, body } = multipartBody({ name: "a.txt" }, "hi", "text/plain", false)
  console.assert(
    body.includes(`--${boundary}\r\nContent-Type: application/json`),
    "metadata part"
  )
  console.assert(body.includes('"name":"a.txt"'), "metadata json")
  console.assert(body.endsWith(`\r\n\r\nhi\r\n--${boundary}--`), "media part + closing boundary")
  console.assert(!body.includes("Content-Transfer-Encoding"), "no transfer-encoding for text")
  const bin = multipartBody({ name: "x" }, "QUFB", "image/png", true)
  console.assert(bin.body.includes("Content-Transfer-Encoding: base64"), "base64 transfer-encoding")
  console.log("drive multipart self-check ok")
}
