import { defineToolkit, githubApp, oauth2 } from "../core/index"
import { generatedTools } from "./generated/index"

export default defineToolkit({
  slug: "github",
  name: "GitHub",
  // Primary: OAuth App (act as the user). Alt: GitHub App (act as an installation).
  auth: oauth2({
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo", "read:user"],
  }),
  altAuth: [githubApp()],
  baseUrl: "https://api.github.com",
  webhooks: {
    signatureHeader: "x-hub-signature-256",
    signaturePrefix: "sha256=",
    eventHeader: "x-github-event",
  },
  usage: `The full GitHub REST API surface available to a GitHub App (${generatedTools.length} tools),
auto-generated from GitHub's OpenAPI spec and grouped by resource: \`issues.*\`, \`pulls.*\`,
\`repos.*\`, \`actions.*\`, \`orgs.*\`, \`git.*\`, \`search.*\`, and more.

When to use:
- Prefer \`search.issues-and-pull-requests\` with GitHub query syntax (e.g. \`repo:owner/name is:open label:bug\`) over listing when you're looking for something specific.
- Call \`repos.get-content\` before \`repos.create-or-update-file-contents\`: to update a file you must pass the current blob \`sha\`, and \`content\` must be **base64-encoded** (this tool forwards it verbatim per the GitHub API).
- \`actions.create-workflow-dispatch\` needs the workflow file name or id and a \`ref\`.

Conventions:
- \`owner\` and \`repo\` are required on most repo tools — resolve them from the request first. They're validated locally; other params are validated by GitHub, which returns a clear error.
- Numbers (issue_number, pull_number, run_id) are integers.
- List endpoints paginate: pass \`per_page\` (max 100) and \`page\`.
- Write actions (merge, comment, delete) are irreversible — confirm intent before calling.`,
  tools: generatedTools,
})
