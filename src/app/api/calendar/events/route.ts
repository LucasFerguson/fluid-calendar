import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "calendar-events-route";

// Safety cap on how many rows a single windowed fetch may return. A normal
// month/week window is small; this only bites a pathologically wide window over
// a dense archive. The cap is NEVER silent: when it is hit we logger.warn and
// flag the envelope with `truncated: true` (see below) so WS3/WS1 can render a
// visible nav-bar warning instead of dropping events without the user noticing.
export const DEFAULT_LIMIT = 5000;

/**
 * The row cap is a hard `take` limit, so hitting it means there were (at least)
 * `limit` matching rows and the result is truncated. Kept as a pure helper so
 * the "never silently drop events" contract is unit tested.
 */
export function isTruncated(count: number, limit: number): boolean {
  return count >= limit;
}

export type CalendarEventFields = "slim" | "full";

export interface BuildCalendarEventsWhereOptions {
  userId: string;
  rangeStart: Date;
  rangeEnd: Date;
  feedIds?: string[];
  enabledOnly: boolean;
  includeCancelled: boolean;
  includeMasters: boolean;
}

/**
 * Build the Prisma `where` for a windowed calendar-events fetch.
 *
 * Pure and side-effect free so it can be unit tested directly.
 *
 * Semantics:
 *  - Window overlap: an event overlaps [rangeStart, rangeEnd] iff
 *    `start <= rangeEnd AND end >= rangeStart` (inclusive on both ends, which is
 *    also correct for all-day events).
 *  - enabledOnly (default true): only events whose feed is `enabled` — users
 *    toggle calendars on/off and we must not fetch events for disabled ones.
 *  - includeCancelled (default false): excludes soft-deleted/archived rows.
 *    Deletions never remove rows, they set `status: "cancelled"`. We use the
 *    `OR:[{status:null},{status:{not:"cancelled"}}]` form on purpose: a bare
 *    `status:{not:"cancelled"}` would also drop NULL-status rows (manual/local
 *    events), hiding them from the calendar.
 *  - includeMasters (default false): suppresses recurring master rows
 *    (`isRecurring && isMaster`). Concrete occurrences are materialized as
 *    separate instance rows, and the client renders those; returning the master
 *    too would duplicate the first occurrence. Keeping masters out also means we
 *    never ship an RRULE the client could re-expand into a cancelled occurrence.
 */
export function buildCalendarEventsWhere(
  opts: BuildCalendarEventsWhereOptions
): Prisma.CalendarEventWhereInput {
  const {
    userId,
    rangeStart,
    rangeEnd,
    feedIds,
    enabledOnly,
    includeCancelled,
    includeMasters,
  } = opts;

  const feed: Prisma.CalendarFeedWhereInput = { userId };
  if (enabledOnly) {
    feed.enabled = true;
  }
  if (feedIds && feedIds.length > 0) {
    feed.id = { in: feedIds };
  }

  const where: Prisma.CalendarEventWhereInput = {
    feed,
    // Window overlap predicate, backed by @@index([feedId, start, end]).
    start: { lte: rangeEnd },
    end: { gte: rangeStart },
  };

  if (!includeCancelled) {
    // Keep NULL-status rows visible; only exclude explicit "cancelled".
    where.OR = [{ status: null }, { status: { not: "cancelled" } }];
  }

  if (!includeMasters) {
    where.NOT = { AND: [{ isRecurring: true }, { isMaster: true }] };
  }

  return where;
}

const SLIM_SELECT = {
  id: true,
  feedId: true,
  title: true,
  start: true,
  end: true,
  allDay: true,
  location: true,
  status: true,
  isRecurring: true,
  isMaster: true,
  masterEventId: true,
  externalEventId: true,
  feed: { select: { name: true, color: true } },
} satisfies Prisma.CalendarEventSelect;

const FULL_SELECT = {
  id: true,
  feedId: true,
  externalEventId: true,
  title: true,
  description: true,
  start: true,
  end: true,
  location: true,
  timeZone: true,
  isRecurring: true,
  recurrenceRule: true,
  allDay: true,
  status: true,
  sequence: true,
  created: true,
  lastModified: true,
  organizer: true,
  attendees: true,
  isMaster: true,
  masterEventId: true,
  recurringEventId: true,
  feed: { select: { name: true, color: true } },
} satisfies Prisma.CalendarEventSelect;

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
