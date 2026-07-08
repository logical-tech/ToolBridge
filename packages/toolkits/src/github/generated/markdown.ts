// AUTO-GENERATED from GitHub OpenAPI spec — do not edit. Regenerate: bun run gen:github
import { httpTool } from "../../core/index"

export const markdown = [
  httpTool({"slug":"markdown.render","description":"Render a Markdown document","method":"post","path":"/markdown","pathParams":[],"queryParams":[],"jsonSchema":{"type":"object","properties":{"text":{"description":"The Markdown text to render in HTML.","type":"string"},"mode":{"description":"The rendering mode.","enum":["markdown","gfm"],"default":"markdown","type":"string"},"context":{"description":"The repository context to use when creating references in `gfm` mode.  For example, setting `context` to `octo-org/octo-repo` will change the text `#42` into an HTML link to issue 42 in the `octo-org/octo-repo` repository.","type":"string"}},"required":["text"],"additionalProperties":false}}),
  httpTool({"slug":"markdown.render-raw","description":"Render a Markdown document in raw mode","method":"post","path":"/markdown/raw","pathParams":[],"queryParams":[],"jsonSchema":{"type":"object","properties":{},"additionalProperties":true}}),
]
