// AUTO-GENERATED from Google Discovery — do not edit. Regenerate: bun run gen:google
import { httpTool } from "../../core/index"

export const operations = [
  httpTool({"slug":"drive.operations.get","description":"Gets the latest state of a long-running operation. Clients can use this method to poll the operation result at intervals as recommended by the API service.","method":"GET","path":"/operations/{name}","pathParams":["name"],"queryParams":[],"jsonSchema":{"type":"object","properties":{"name":{"description":"The name of the operation resource.","type":"string"}},"required":["name"],"additionalProperties":false},"default":false}),
]
