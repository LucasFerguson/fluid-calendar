import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ApiKeyIdAPI";

// Revoke (soft-delete) an API key. A revoked key can no longer authenticate.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;

    const { id } = await params;
    const key = await prisma.apiKey.findFirst({
      where: { id, userId: auth.userId },
    });
    if (!key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(
      "Failed to revoke API key",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to revoke API key" },
      { status: 500 }
    );
  }
}
