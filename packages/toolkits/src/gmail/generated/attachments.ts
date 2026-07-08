// AUTO-GENERATED from Google Discovery — do not edit. Regenerate: bun run gen:google
import { httpTool } from "../../core/index"

export const attachments = [
  httpTool({"slug":"gmail.users.messages.attachments.get","description":"Gets the specified message attachment.","method":"GET","path":"/users/{userId}/messages/{messageId}/attachments/{id}","pathParams":["messageId","id","userId"],"queryParams":[],"jsonSchema":{"type":"object","properties":{"messageId":{"type":"string","description":"The ID of the message containing the attachment."},"id":{"type":"string","description":"The ID of the attachment."},"userId":{"description":"The user's email address. The special value `me` can be used to indicate the authenticated user.","default":"me","type":"string"}},"required":["messageId","id","userId"],"additionalProperties":false},"default":false}),
]
