// AES-256-GCM credential encryption + HMAC-signed OAuth state.
// Key from ENCRYPTION_KEY (base64, 32 bytes). No deps — crypto.subtle is built-in.

const KEY_B64 = process.env.ENCRYPTION_KEY
if (!KEY_B64) throw new Error("ENCRYPTION_KEY is not set")

const rawKey = Buffer.from(KEY_B64, "base64")
if (rawKey.length !== 32)
  throw new Error(`ENCRYPTION_KEY must decode to 32 bytes, got ${rawKey.length}`)

const aesKey = await crypto.subtle.importKey(
  "raw",
  rawKey,
  { name: "AES-GCM" },
  false,
  ["encrypt", "decrypt"]
)

/** → `base64(iv).base64(ciphertext+tag)` */
export async function encrypt(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(plaintext)
  )
  return `${Buffer.from(iv).toString("base64")}.${Buffer.from(ct).toString("base64")}`
}

export async function decrypt(payload: string): Promise<string> {
  const [ivB64, ctB64] = payload.split(".")
  if (!ivB64 || !ctB64) throw new Error("malformed ciphertext")
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(ivB64, "base64") },
    aesKey,
    Buffer.from(ctB64, "base64")
  )
  return new TextDecoder().decode(pt)
}

// ── OAuth state: stateless HMAC token so no DB column is needed ──────────
// state = `<value>.<hmac>`; carries the connected_account id through the redirect.

const hmacKey = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(process.env.BETTER_AUTH_SECRET ?? "dev-secret"),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"]
)

async function hmac(value: string): Promise<string> {
  const sig = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    new TextEncoder().encode(value)
  )
  return Buffer.from(sig).toString("base64url")
}

export async function signState(value: string): Promise<string> {
  return `${value}.${await hmac(value)}`
}

export async function verifyState(state: string): Promise<string | null> {
  const [value, sig] = state.split(".")
  if (!value || !sig) return null
  return (await hmac(value)) === sig ? value : null
}

// ── Webhook signature verification (HMAC-SHA256, constant-time) ─────────
// GitHub-style: header carries `sha256=<hex>` computed over the raw body.

export async function verifyHmacSha256(
  secret: string,
  rawBody: string,
  providedHex: string
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody))
  const expectedHex = Buffer.from(sig).toString("hex")
  if (expectedHex.length !== providedHex.length) return false
  let diff = 0
  for (let i = 0; i < expectedHex.length; i++)
    diff |= expectedHex.charCodeAt(i) ^ providedHex.charCodeAt(i)
  return diff === 0
}

// Round-trip self-check
if (import.meta.main) {
  const secret = "hello-token-🔐"
  const enc = await encrypt(secret)
  if (await decrypt(enc) !== secret) throw new Error("crypto round-trip failed")
  const st = await signState("acc_123")
  if (await verifyState(st) !== "acc_123") throw new Error("state verify failed")
  if (await verifyState("acc_123.tampered") !== null)
    throw new Error("state should reject tampering")
  // webhook HMAC: real GitHub example (secret "It's a Secret to Everybody", body "Hello, World!")
  const ghHex = "757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17"
  if (!(await verifyHmacSha256("It's a Secret to Everybody", "Hello, World!", ghHex)))
    throw new Error("hmac verify failed on known vector")
  if (await verifyHmacSha256("wrong", "Hello, World!", ghHex))
    throw new Error("hmac should reject wrong secret")
  console.log("crypto self-check OK")
}
