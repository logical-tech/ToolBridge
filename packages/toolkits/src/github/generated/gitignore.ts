// AUTO-GENERATED from GitHub OpenAPI spec — do not edit. Regenerate: bun run gen:github
import { httpTool } from "../../core/index"

export const gitignore = [
  httpTool({"slug":"gitignore.get-all-templates","description":"Get all gitignore templates","method":"get","path":"/gitignore/templates","pathParams":[],"queryParams":[],"jsonSchema":{"type":"object","properties":{},"additionalProperties":false}}),
  httpTool({"slug":"gitignore.get-template","description":"Get a gitignore template","method":"get","path":"/gitignore/templates/{name}","pathParams":["name"],"queryParams":[],"jsonSchema":{"type":"object","properties":{"name":{"type":"string"}},"required":["name"],"additionalProperties":false}}),
]
