/**
 * Locks the auto-scheduler's calendar availability query so it never counts
 * soft-deleted/archived events as busy. In this archival mirror, deletions set
 * status:"cancelled" instead of removing rows; a cancelled busy block (e.g. a
 * deleted recurring "work" event) must NOT block auto-scheduling. NULL status is
 * a live local/manual event and must still count as busy.
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    calendarEvent: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

import { prisma } from "@/lib/prisma";

import { CalendarServiceImpl } from "../CalendarServiceImpl";

const mockPrisma = prisma as unknown as {
  calendarEvent: { findMany: jest.Mock };
};

describe("CalendarServiceImpl.getEvents", () => {
  beforeEach(() => {
    mockPrisma.calendarEvent.findMany.mockClear();
  });

  it("excludes cancelled events but keeps NULL-status ones in the where clause", async () => {
    const service = new CalendarServiceImpl();
    const start = new Date("2026-07-20T00:00:00.000Z");
    const end = new Date("2026-07-27T00:00:00.000Z");

    await service.getEvents(start, end, ["feed-1"]);

    expect(mockPrisma.calendarEvent.findMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.calendarEvent.findMany.mock.calls[0][0];

    // feed + window filters still present
    expect(arg.where.feedId).toEqual({ in: ["feed-1"] });
    // the cancelled-exclusion clause is applied (NULL-safe)
    expect(arg.where.AND).toEqual(
      expect.arrayContaining([
        { OR: [{ status: null }, { status: { not: "cancelled" } }] },
      ])
    );
  });

  it("returns no events (and does not query) when no calendars are selected", async () => {
    const service = new CalendarServiceImpl();
    const events = await service.getEvents(new Date(), new Date(), []);
    expect(events).toEqual([]);
    expect(mockPrisma.calendarEvent.findMany).not.toHaveBeenCalled();
  });
});
