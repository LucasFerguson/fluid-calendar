import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { generateApiKey } from "@/lib/auth/api-key";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ApiKeysAPI";

// List the current user's API keys (never returns the raw key or hash).
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;

    const keys = await prisma.apiKey.findMany({
      where: { userId: auth.userId },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(keys);
  } catch (error) {
    logger.error(
      "Failed to list API keys",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to list API keys" },
      { status: 500 }
    );
  }
}

// Create a new API key. The raw key is returned exactly once, here.
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;

    const { name, scopes } = await request.json();
    const normalizedScopes = scopes === "read,write" ? "read,write" : "read";

    const { raw, hash, prefix } = generateApiKey();
    const key = await prisma.apiKey.create({
      data: {
        userId: auth.userId!,
        name: (name && String(name).slice(0, 100)) || "API key",
        keyHash: hash,
        prefix,
        scopes: normalizedScopes,
      },
      select: { id: true, name: true, prefix: true, scopes: true },
    });

    // `key` (raw) is only ever returned in this response.
    return NextResponse.json({ ...key, key: raw }, { status: 201 });
  } catch (error) {
    logger.error(
      "Failed to create API key",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to create API key" },
      { status: 500 }
    );
  }
}
