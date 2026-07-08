// AUTO-GENERATED from GitHub OpenAPI spec — do not edit. Regenerate: bun run gen:github
import { httpTool } from "../../core/index"

export const meta = [
  httpTool({"slug":"meta.get","description":"Get GitHub meta information","method":"get","path":"/meta","pathParams":[],"queryParams":[],"jsonSchema":{"type":"object","properties":{},"additionalProperties":false}}),
  httpTool({"slug":"meta.get-all-versions","description":"Get all API versions","method":"get","path":"/versions","pathParams":[],"queryParams":[],"jsonSchema":{"type":"object","properties":{},"additionalProperties":false}}),
  httpTool({"slug":"meta.get-octocat","description":"Get Octocat","method":"get","path":"/octocat","pathParams":[],"queryParams":["s"],"jsonSchema":{"type":"object","properties":{"s":{"type":"string","description":"The words to show in Octocat's speech bubble"}},"additionalProperties":false}}),
  httpTool({"slug":"meta.get-zen","description":"Get the Zen of GitHub","method":"get","path":"/zen","pathParams":[],"queryParams":[],"jsonSchema":{"type":"object","properties":{},"additionalProperties":false}}),
  httpTool({"slug":"meta.root","description":"GitHub API Root","method":"get","path":"/","pathParams":[],"queryParams":[],"jsonSchema":{"type":"object","properties":{},"additionalProperties":false}}),
]
