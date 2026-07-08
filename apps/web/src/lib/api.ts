export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000"

/** fetch wrapper for the Tool Bridge API — sends the session cookie. */
export async function api<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  })
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw new Error((data as any)?.error ?? `HTTP ${res.status}`)
  return data as T
}
