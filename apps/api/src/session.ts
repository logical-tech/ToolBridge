import type { Context } from "hono"
import { auth } from "./auth"

/** Returns the logged-in user id, or null (dashboard session cookie). */
export async function getUserId(c: Context): Promise<string | null> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  return session?.user.id ?? null
}
