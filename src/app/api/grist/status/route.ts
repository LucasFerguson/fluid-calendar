import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { getGristPublicInfo } from "@/lib/grist/config";
import { readGristSyncStatus } from "@/lib/grist/sync";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "GristStatusAPI";

// Read-only connection info for the Settings page: how the Grist CRM is wired
// (server, doc, tables, whether a key is present) plus the last sync summary.
// Configuration itself lives in .env by design.

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const [info, lastSync] = [getGristPublicInfo(), await readGristSyncStatus()];
    return NextResponse.json({ ...info, lastSync });
  } catch (error) {
    logger.error(
      "Failed to read Grist status",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to read Grist status" },
      { status: 500 }
    );
  }
}
