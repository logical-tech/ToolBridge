// AUTO-GENERATED from GitHub OpenAPI spec — do not edit. Regenerate: bun run gen:github
import { httpTool } from "../../core/index"

export const codes_of_conduct = [
  httpTool({"slug":"codes-of-conduct.get-all-codes-of-conduct","description":"Get all codes of conduct","method":"get","path":"/codes_of_conduct","pathParams":[],"queryParams":[],"jsonSchema":{"type":"object","properties":{},"additionalProperties":false}}),
  httpTool({"slug":"codes-of-conduct.get-conduct-code","description":"Get a code of conduct","method":"get","path":"/codes_of_conduct/{key}","pathParams":["key"],"queryParams":[],"jsonSchema":{"type":"object","properties":{"key":{"type":"string"}},"required":["key"],"additionalProperties":false}}),
]
