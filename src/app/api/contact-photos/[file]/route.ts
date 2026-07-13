import { readFile } from "fs/promises";
import path from "path";

import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "ContactPhotosAPI";

// Serves contact profile photos that the Grist sync downloaded into
// data/contact-photos, so avatars never hot-link the CRM server.

const PHOTO_DIR = path.join(process.cwd(), "data", "contact-photos");

const TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const { file } = await params;
    // Filenames are always "<sha1>.<ext>"; anything else (traversal, etc.) is
    // rejected outright.
    if (!/^[0-9a-f]{40}\.[a-z0-9]{2,5}$/.test(file)) {
      return new NextResponse("Not found", { status: 404 });
    }

    let data: Buffer;
    try {
      data = await readFile(path.join(PHOTO_DIR, file));
    } catch {
      return new NextResponse("Not found", { status: 404 });
    }

    const ext = file.split(".").pop() ?? "";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": TYPE_BY_EXT[ext] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    logger.error(
      "Failed to serve contact photo",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal error", { status: 500 });
  }
}
