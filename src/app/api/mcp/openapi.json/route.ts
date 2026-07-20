import { NextRequest, NextResponse } from "next/server";

import { buildOpenApiSpec } from "@/lib/mcp/openapi";

// Public OpenAPI document for the agent tool server. Exposes only tool
// definitions (no user data), so it needs no auth — the tool CALLS require an
// API key. Open WebUI fetches this to discover the available tools.
export async function GET(request: NextRequest) {
  const proto =
    request.headers.get("x-forwarded-proto") ??
    new URL(request.url).protocol.replace(":", "");
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host;

  const spec = buildOpenApiSpec(`${proto}://${host}/api/mcp`);
  return NextResponse.json(spec);
}
