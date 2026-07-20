import { Prisma } from "@prisma/client";

// Pure query-building helpers for GET /api/calendar/events. These live in their
// own module (not route.ts) because a Next.js route file may only export HTTP
// handlers and route config — exporting helpers like `buildCalendarEventsWhere`
// from route.ts fails `next build` ("not a valid Route export field"), even
// though tsc/lint accept it. Keeping them here also lets the unit tests import
// them directly.

// Safety cap on how many rows a single windowed fetch may return. A normal
// month/week window is small; this only bites a pathologically wide window over
// a dense archive. The cap is NEVER silent: when it is hit the route logger.warns
// and flags the envelope with `truncated: true` so WS3/WS1 can render a visible
// nav-bar warning instead of dropping events without the user noticing.
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

export const SLIM_SELECT = {
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

export const FULL_SELECT = {
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
