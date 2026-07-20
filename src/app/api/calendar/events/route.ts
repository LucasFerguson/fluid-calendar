import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import {
  CalendarEventFields,
  DEFAULT_LIMIT,
  FULL_SELECT,
  SLIM_SELECT,
  buildCalendarEventsWhere,
  isTruncated,
} from "./query";

const LOG_SOURCE = "calendar-events-route";

/**
 * GET /api/calendar/events — windowed calendar event fetch.
 *
 * Query params:
 *  - start, end        (required ISO datetimes) — the visible window. 400 if
 *                      missing, unparseable, or end <= start.
 *  - feedIds           (optional, comma-separated) — restrict to these feeds
 *                      (still intersected with the caller's ownership).
 *  - enabledOnly       (default "true") — exclude events on disabled feeds.
 *  - includeCancelled  (default "false") — include soft-cancelled/archived rows.
 *  - includeMasters    (default "false") — include recurring master rows.
 *  - fields            ("slim" | "full", default "full") — payload size.
 *  - limit             (default 5000, capped) — safety cap; see DEFAULT_LIMIT.
 *
 * Response envelope:
 *  { events, window: { start, end }, count, hasMore, truncated }
 * `truncated` (and `hasMore`) are true when the row cap was hit — the caller
 * MUST surface this visibly (nav-bar warning) rather than silently dropping
 * events.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const userId = auth.userId;

    const params = request.nextUrl.searchParams;
    const startParam = params.get("start");
    const endParam = params.get("end");

    if (!startParam || !endParam) {
      return NextResponse.json(
        { error: "start and end query params are required" },
        { status: 400 }
      );
    }

    const rangeStart = newDate(startParam);
    const rangeEnd = newDate(endParam);

    if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
      return NextResponse.json(
        { error: "start and end must be valid dates" },
        { status: 400 }
      );
    }
    if (rangeEnd.getTime() <= rangeStart.getTime()) {
      return NextResponse.json(
        { error: "end must be after start" },
        { status: 400 }
      );
    }

    const feedIdsParam = params.get("feedIds");
    const feedIds = feedIdsParam
      ? feedIdsParam
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined;

    // Defaults: enabledOnly TRUE, includeCancelled FALSE, includeMasters FALSE.
    const enabledOnly = params.get("enabledOnly") !== "false";
    const includeCancelled = params.get("includeCancelled") === "true";
    const includeMasters = params.get("includeMasters") === "true";
    const fields: CalendarEventFields =
      params.get("fields") === "slim" ? "slim" : "full";

    const limitParam = Number(params.get("limit"));
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(Math.floor(limitParam), DEFAULT_LIMIT)
        : DEFAULT_LIMIT;

    const where = buildCalendarEventsWhere({
      userId,
      rangeStart,
      rangeEnd,
      feedIds,
      enabledOnly,
      includeCancelled,
      includeMasters,
    });

    const events = await prisma.calendarEvent.findMany({
      where,
      select: fields === "slim" ? SLIM_SELECT : FULL_SELECT,
      orderBy: { start: "asc" },
      take: limit,
    });

    const truncated = isTruncated(events.length, limit);
    if (truncated) {
      // Loud, never silent: the window returned more rows than the cap. WS3/WS1
      // render a visible nav-bar warning when `truncated` is true.
      logger.warn(
        "Windowed calendar fetch hit the row cap; result truncated",
        {
          userId,
          start: rangeStart.toISOString(),
          end: rangeEnd.toISOString(),
          count: events.length,
          limit,
        },
        LOG_SOURCE
      );
    }

    return NextResponse.json({
      events,
      window: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
      count: events.length,
      hasMore: truncated,
      truncated,
    });
  } catch (error) {
    logger.error(
      "Failed to fetch windowed calendar events:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to fetch calendar events" },
      { status: 500 }
    );
  }
}
