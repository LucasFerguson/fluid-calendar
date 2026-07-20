/**
 * Locks the local delete semantics that make the cancelled-exclusion query
 * filters correct: Google feeds are a full archive, so locally-initiated deletes
 * SOFT-cancel (status:"cancelled") instead of removing rows, and the
 * thisAndFollowing path must NOT rewrite the master's recurrenceRule locally
 * (the next sync reconciles it). Non-Google feeds keep hard-delete semantics.
 */

// Mock the prisma singleton before importing the module under test.
jest.mock("@/lib/prisma", () => ({
  prisma: {
    calendarEvent: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn().mockResolvedValue({}),
    },
    calendarEventChange: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
}));

import { deleteCalendarEvent } from "@/lib/calendar-db";
import { prisma } from "@/lib/prisma";

type Row = Record<string, unknown>;

const mockPrisma = prisma as unknown as {
  calendarEvent: {
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
  };
  calendarEventChange: { create: jest.Mock };
};

function feed(type: "GOOGLE" | "CALDAV") {
  return {
    id: "feed-1",
    type,
    url: "https://example.com/cal",
    caldavPath: type === "CALDAV" ? "/dav/cal" : null,
    accountId: "acc-1",
    color: null,
    lastSync: null,
    error: null,
    syncToken: null,
    userId: "user-1",
  };
}

function stubEvent(row: Row, type: "GOOGLE" | "CALDAV" = "GOOGLE") {
  // getEvent() does findUnique({ include: { feed: true } }) then maps it.
  mockPrisma.calendarEvent.findUnique.mockResolvedValue({
    id: "evt-1",
    feedId: "feed-1",
    externalEventId: "ext-1",
    start: new Date("2026-07-10T09:00:00.000Z"),
    end: new Date("2026-07-10T10:00:00.000Z"),
    isMaster: false,
    masterEventId: null,
    ...row,
    feed: feed(type),
  });
}

afterEach(() => {
  jest.clearAllMocks();
});

describe("deleteCalendarEvent — Google feeds soft-cancel", () => {
  it("single mode updates status to cancelled and never deletes the row", async () => {
    stubEvent({ id: "evt-1" });

    await deleteCalendarEvent("evt-1", "single");

    expect(mockPrisma.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: "evt-1" },
      data: { status: "cancelled" },
    });
    expect(mockPrisma.calendarEvent.delete).not.toHaveBeenCalled();
  });

  it("series mode cancels the master and all its instances via updateMany", async () => {
    stubEvent({ id: "inst-1", isMaster: false, masterEventId: "master-1" });

    await deleteCalendarEvent("inst-1", "series");

    expect(mockPrisma.calendarEvent.updateMany).toHaveBeenCalledWith({
      where: { OR: [{ id: "master-1" }, { masterEventId: "master-1" }] },
      data: { status: "cancelled" },
    });
    expect(mockPrisma.calendarEvent.delete).not.toHaveBeenCalled();
  });

  it("thisAndFollowing cancels this + later instances and does NOT rewrite the master RRULE", async () => {
    const start = new Date("2026-07-20T09:00:00.000Z");
    stubEvent({
      id: "inst-1",
      isMaster: false,
      masterEventId: "master-1",
      start,
    });

    await deleteCalendarEvent("inst-1", "thisAndFollowing");

    expect(mockPrisma.calendarEvent.updateMany).toHaveBeenCalledWith({
      where: {
        masterEventId: "master-1",
        start: { gte: start },
        status: { not: "cancelled" },
      },
      data: { status: "cancelled" },
    });

    // The whole point: no local RRULE truncation — the sync reconciles it.
    const dataArgs = mockPrisma.calendarEvent.updateMany.mock.calls.map(
      (call) => call[0].data
    );
    for (const data of dataArgs) {
      expect(data).not.toHaveProperty("recurrenceRule");
    }
    // A clicked instance (not the master) must not trigger a master update.
    expect(mockPrisma.calendarEvent.update).not.toHaveBeenCalled();
  });
});

describe("deleteCalendarEvent — non-Google feeds hard-delete", () => {
  it("single mode deletes the row and never writes a cancelled status", async () => {
    stubEvent({ id: "evt-1" }, "CALDAV");

    await deleteCalendarEvent("evt-1", "single");

    expect(mockPrisma.calendarEvent.delete).toHaveBeenCalledWith({
      where: { id: "evt-1" },
    });
    expect(mockPrisma.calendarEvent.update).not.toHaveBeenCalled();
    expect(mockPrisma.calendarEvent.updateMany).not.toHaveBeenCalled();
  });
});
