import { Prisma } from "@prisma/client";

import {
  DEFAULT_LIMIT,
  buildCalendarEventsWhere,
  isTruncated,
} from "@/app/api/calendar/events/query";

const USER_ID = "user-123";
const RANGE_START = new Date("2026-07-01T00:00:00.000Z");
const RANGE_END = new Date("2026-08-01T00:00:00.000Z");

function baseOpts() {
  return {
    userId: USER_ID,
    rangeStart: RANGE_START,
    rangeEnd: RANGE_END,
    enabledOnly: true,
    includeCancelled: false,
    includeMasters: false,
  };
}

describe("buildCalendarEventsWhere", () => {
  it("scopes to the user's feeds", () => {
    const where = buildCalendarEventsWhere(baseOpts());
    const feed = where.feed as Prisma.CalendarFeedWhereInput;
    expect(feed.userId).toBe(USER_ID);
  });

  it("applies the window overlap predicate (start <= rangeEnd AND end >= rangeStart)", () => {
    const where = buildCalendarEventsWhere(baseOpts());
    expect(where.start).toEqual({ lte: RANGE_END });
    expect(where.end).toEqual({ gte: RANGE_START });
  });

  it("restricts to enabled feeds by default", () => {
    const where = buildCalendarEventsWhere(baseOpts());
    const feed = where.feed as Prisma.CalendarFeedWhereInput;
    expect(feed.enabled).toBe(true);
  });

  it("omits the enabled filter when enabledOnly is false", () => {
    const where = buildCalendarEventsWhere({
      ...baseOpts(),
      enabledOnly: false,
    });
    const feed = where.feed as Prisma.CalendarFeedWhereInput;
    expect(feed.enabled).toBeUndefined();
  });

  it("excludes cancelled rows but keeps NULL-status rows by default", () => {
    const where = buildCalendarEventsWhere(baseOpts());
    // The OR form is required: a bare { status: { not: "cancelled" } } would
    // also drop NULL-status (manual/local) events.
    expect(where.OR).toEqual([
      { status: null },
      { status: { not: "cancelled" } },
    ]);
  });

  it("drops the cancelled exclusion when includeCancelled is true", () => {
    const where = buildCalendarEventsWhere({
      ...baseOpts(),
      includeCancelled: true,
    });
    expect(where.OR).toBeUndefined();
  });

  it("suppresses recurring master rows by default", () => {
    const where = buildCalendarEventsWhere(baseOpts());
    expect(where.NOT).toEqual({
      AND: [{ isRecurring: true }, { isMaster: true }],
    });
  });

  it("includes master rows when includeMasters is true", () => {
    const where = buildCalendarEventsWhere({
      ...baseOpts(),
      includeMasters: true,
    });
    expect(where.NOT).toBeUndefined();
  });

  it("restricts to the requested feedIds (intersected with ownership)", () => {
    const where = buildCalendarEventsWhere({
      ...baseOpts(),
      feedIds: ["feed-a", "feed-b"],
    });
    const feed = where.feed as Prisma.CalendarFeedWhereInput;
    expect(feed.userId).toBe(USER_ID);
    expect(feed.id).toEqual({ in: ["feed-a", "feed-b"] });
  });

  it("ignores an empty feedIds list", () => {
    const where = buildCalendarEventsWhere({ ...baseOpts(), feedIds: [] });
    const feed = where.feed as Prisma.CalendarFeedWhereInput;
    expect(feed.id).toBeUndefined();
  });
});

describe("isTruncated", () => {
  it("is true only when the row count reaches the cap", () => {
    expect(isTruncated(DEFAULT_LIMIT, DEFAULT_LIMIT)).toBe(true);
    expect(isTruncated(DEFAULT_LIMIT - 1, DEFAULT_LIMIT)).toBe(false);
    expect(isTruncated(0, DEFAULT_LIMIT)).toBe(false);
  });
});
