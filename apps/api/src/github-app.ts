import { createSign } from "node:crypto"

// GitHub App auth: sign a short-lived RS256 JWT with the app private key, then
// exchange it for an installation access token. node:crypto.sign accepts both
// PKCS#1 ("BEGIN RSA PRIVATE KEY", GitHub's download format) and PKCS#8 PEMs.

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url")

export function githubAppJwt(appId: string, privateKeyPem: string, nowSec: number): string {
  const data = `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url({
    iat: nowSec - 60, // clock-skew slack
    exp: nowSec + 540, // 9 min (GitHub max is 10)
    iss: appId,
  })}`
  const sig = createSign("RSA-SHA256").update(data).sign(privateKeyPem, "base64url")
  return `${data}.${sig}`
}

export async function fetchInstallationToken(
  jwt: string,
  installationId: string
): Promise<{ token: string; expires_at: string }> {
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "ToolBridge",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  )
  const json = (await res.json()) as any
  if (!res.ok) throw new Error(`installation token failed: ${JSON.stringify(json)}`)
  return json
}

// Self-check: sign a JWT with a generated PKCS#1 key and verify it round-trips.
if (import.meta.main) {
  const { generateKeyPairSync, createVerify } = await import("node:crypto")
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" }, // GitHub's format
    publicKeyEncoding: { type: "spki", format: "pem" },
  })
  const jwt = githubAppJwt("12345", privateKey, 1_000_000_000)
  const [h, p, s] = jwt.split(".")
  if (!createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, s!, "base64url"))
    throw new Error("jwt signature invalid")
  const payload = JSON.parse(Buffer.from(p!, "base64url").toString())
  if (payload.iss !== "12345") throw new Error("iss mismatch")
  if (payload.exp - payload.iat !== 600) throw new Error("exp window wrong")
  console.log("github-app jwt self-check OK")
}
