// AUTO-GENERATED from Google Discovery — do not edit. Regenerate: bun run gen:google
import { httpTool } from "../../core/index"

export const about = [
  httpTool({"slug":"drive.about.get","description":"Gets information about the user, the user's Drive, and system capabilities. For more information, see [Return user info](https://developers.google.com/workspace/drive/api/guides/user-info). Required: The `fields` parameter must be set. To return the exact fields you need, see [Return specific fields","method":"GET","path":"/about","pathParams":[],"queryParams":[],"jsonSchema":{"type":"object","properties":{},"additionalProperties":false},"default":false}),
]
