import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

import { apiKeyFromHeaders, hashApiKey } from "@/lib/auth/api-key";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "APIAuth";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Authenticates a request and returns the user ID if authenticated.
 *
 * Two auth methods are accepted:
 *  - A machine API key via `Authorization: Bearer fc_...` or `X-API-Key`
 *    (for homelab integrations). Read-only keys may only make GET requests.
 *  - The NextAuth session (browser). Used when no API key is presented.
 *
 * @returns An object with userId if authenticated, or a NextResponse if unauthorized
 */
export async function authenticateRequest(
  request: NextRequest,
  logSource: string
) {
  // 1. API key path (machine clients).
  const presentedKey = apiKeyFromHeaders(request.headers);
  if (presentedKey) {
    const key = await prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(presentedKey) },
    });
    if (!key || key.revokedAt) {
      logger.warn("Invalid or revoked API key", {}, logSource);
      return { response: new NextResponse("Unauthorized", { status: 401 }) };
    }
    const canWrite = key.scopes.split(",").includes("write");
    if (MUTATION_METHODS.has(request.method) && !canWrite) {
      return {
        response: new NextResponse("API key is read-only", { status: 403 }),
      };
    }
    // Best-effort last-used stamp; never block the request on it.
    void prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return { userId: key.userId };
  }

  // 2. Session path (browser).
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    logger.warn("Unauthorized access attempt to API", {}, logSource);
    return { response: new NextResponse("Unauthorized", { status: 401 }) };
  }

  const userId = token.sub;
  if (!userId) {
    logger.warn("No user ID found in token", {}, logSource);
    return { response: new NextResponse("Unauthorized", { status: 401 }) };
  }

  return { userId };
}

/**
 * Middleware to ensure a user is authenticated for API routes
 * @param req The Next.js request object
 * @returns A response if authentication fails, or null if authentication succeeds
 */
export async function requireAuth(
  req: NextRequest
): Promise<NextResponse | null> {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token) {
      logger.warn(
        "Unauthenticated API access attempt",
        { path: req.nextUrl.pathname },
        LOG_SOURCE
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return null; // Authentication successful
  } catch (error) {
    logger.error(
      "Error in API authentication",
      {
        error: error instanceof Error ? error.message : "Unknown error",
        path: req.nextUrl.pathname,
      },
      LOG_SOURCE
    );

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Middleware to ensure a user is an admin for API routes
 * @param req The Next.js request object
 * @returns A response if authorization fails, or null if authorization succeeds
 */
export async function requireAdmin(
  req: NextRequest
): Promise<NextResponse | null> {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token) {
      logger.warn(
        "Unauthenticated admin API access attempt",
        { path: req.nextUrl.pathname },
        LOG_SOURCE
      );
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (token.role !== "admin") {
      logger.warn(
        "Non-admin user attempted to access admin API",
        { userId: token.sub ?? "unknown", path: req.nextUrl.pathname },
        LOG_SOURCE
      );

      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return null; // Authorization successful
  } catch (error) {
    logger.error(
      "Error in API admin authorization",
      {
        error: error instanceof Error ? error.message : "Unknown error",
        path: req.nextUrl.pathname,
      },
      LOG_SOURCE
    );

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
