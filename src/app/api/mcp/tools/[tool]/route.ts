import { NextRequest, NextResponse } from "next/server";

import { ZodError } from "zod";

import { logger } from "@/lib/logger";
import { authenticateAgentRequest } from "@/lib/mcp/auth";
import { getTool } from "@/lib/mcp/tools";

const LOG_SOURCE = "McpToolsRoute";

// Dispatch a single agent tool call. Auth is API-key only; write tools require
// a write-scoped key (gated on the tool's declared scope, not the HTTP method).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  const { tool: toolName } = await params;

  const authResult = await authenticateAgentRequest(request.headers);
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }
  const { userId, canWrite } = authResult.auth;

  const tool = getTool(toolName);
  if (!tool) {
    return NextResponse.json(
      { error: `Unknown tool: ${toolName}` },
      { status: 404 }
    );
  }

  if (tool.scope === "write" && !canWrite) {
    return NextResponse.json(
      {
        error: `Tool '${tool.name}' needs a write-scoped API key (this key is read-only).`,
      },
      { status: 403 }
    );
  }

  // Tolerate an empty body for no-argument tools.
  const body = await request.json().catch(() => ({}));

  let args;
  try {
    args = tool.input.parse(body ?? {});
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid arguments", details: error.flatten() },
        { status: 400 }
      );
    }
    throw error;
  }

  try {
    const result = await tool.handler({ userId, canWrite }, args);
    return NextResponse.json(result);
  } catch (error) {
    logger.error(
      "Agent tool call failed",
      {
        tool: tool.name,
        userId,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Tool execution failed",
      },
      { status: 500 }
    );
  }
}
