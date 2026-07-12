import { createHash, randomBytes } from "crypto";

// Machine API keys: a random opaque token shown to the user exactly once. Only
// its SHA-256 hash is stored, so a database leak does not expose usable keys.

const PREFIX = "fc_";

export function generateApiKey(): {
  raw: string;
  hash: string;
  prefix: string;
} {
  const raw = PREFIX + randomBytes(24).toString("hex");
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, 10) };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Extract a presented API key from the Authorization/X-API-Key headers. */
export function apiKeyFromHeaders(headers: Headers): string | null {
  const auth = headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    if (token.startsWith(PREFIX)) return token;
  }
  const x = headers.get("x-api-key");
  if (x?.startsWith(PREFIX)) return x.trim();
  return null;
}
