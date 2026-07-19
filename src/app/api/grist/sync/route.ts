import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { getGristConfig } from "@/lib/grist/config";
import { runGristSyncTracked } from "@/lib/grist/sync";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "GristSyncAPI";

// Pull the Grist CRM into the ContactProfile overlay (one-way, on demand).
// POST so write-scoped API keys are required for machine callers.

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const userId = auth.userId;
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const config = getGristConfig();
    if (!config) {
      return NextResponse.json(
        { error: "Grist is not configured (set GRIST_* in .env)" },
        { status: 400 }
      );
    }

    const summary = await runGristSyncTracked(config, userId, "manual");
    return NextResponse.json(summary);
  } catch (error) {
    logger.error(
      "Grist sync failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      {
        error: `Grist sync failed: ${error instanceof Error ? error.message : "unknown error"}`,
      },
      { status: 502 }
    );
  }
}
