import { apiKeyFromHeaders, hashApiKey } from "@/lib/auth/api-key";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "McpAuth";

export interface AgentAuth {
  userId: string;
  /** True when the key carries the "write" scope (create tools). */
  canWrite: boolean;
}

export type AgentAuthResult =
  | { ok: true; auth: AgentAuth }
  | { ok: false; status: number; error: string };

/**
 * Authenticate an agent/tool request by API key only (no browser session).
 *
 * Unlike the shared `authenticateRequest`, this does NOT gate on HTTP method —
 * agent tool calls are POST-with-body even for reads, so write access is decided
 * per-tool by the caller using `canWrite`, not by the request verb.
 */
export async function authenticateAgentRequest(
  headers: Headers
): Promise<AgentAuthResult> {
  const presentedKey = apiKeyFromHeaders(headers);
  if (!presentedKey) {
    return {
      ok: false,
      status: 401,
      error: "Missing API key. Send it as 'Authorization: Bearer fc_...'.",
    };
  }

  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(presentedKey) },
  });
  if (!key || key.revokedAt) {
    logger.warn("Invalid or revoked API key on MCP request", {}, LOG_SOURCE);
    return { ok: false, status: 401, error: "Invalid or revoked API key." };
  }

  // Best-effort last-used stamp; never block the request on it.
  void prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return {
    ok: true,
    auth: {
      userId: key.userId,
      canWrite: key.scopes.split(",").includes("write"),
    },
  };
}
