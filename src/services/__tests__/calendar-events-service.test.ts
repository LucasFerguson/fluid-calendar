jest.mock("@/lib/prisma", () => ({
  prisma: {
    calendarEvent: { findMany: jest.fn() },
    calendarFeed: { findUnique: jest.fn() },
  },
}));
jest.mock("@/lib/google-calendar", () => ({
  __esModule: true,
  default: jest.fn(),
  createGoogleEvent: jest.fn(),
}));
jest.mock("@/lib/calendar/google-event-write", () => ({
  writeGoogleEventToDatabase: jest.fn(),
}));

import { prisma } from "@/lib/prisma";

import {
  createEvent,
  listEvents,
} from "@/services/calendar-events-service";

const mockPrisma = prisma as unknown as {
  calendarEvent: { findMany: jest.Mock };
  calendarFeed: { findUnique: jest.Mock };
};

describe("calendar-events-service.listEvents", () => {
  beforeEach(() => mockPrisma.calendarEvent.findMany.mockReset());

  it("excludes cancelled + disabled + master rows via the shared where builder", async () => {
    mockPrisma.calendarEvent.findMany.mockResolvedValue([]);
    await listEvents({
      userId: "u1",
      start: "2026-07-01T00:00:00.000Z",
      end: "2026-08-01T00:00:00.000Z",
    });

    const where = mockPrisma.calendarEvent.findMany.mock.calls[0][0].where;
    expect(where.feed).toMatchObject({ userId: "u1", enabled: true });
    expect(where.OR).toEqual([
      { status: null },
      { status: { not: "cancelled" } },
    ]);
    expect(where.NOT).toEqual({
      AND: [{ isRecurring: true }, { isMaster: true }],
    });
  });
});

describe("calendar-events-service.createEvent", () => {
  beforeEach(() => mockPrisma.calendarFeed.findUnique.mockReset());

  it("rejects a non-writable (non-Google) calendar", async () => {
    mockPrisma.calendarFeed.findUnique.mockResolvedValue({
      type: "CALDAV",
      url: "https://dav",
      accountId: "a1",
      name: "My CalDAV",
    });

    await expect(
      createEvent({
        userId: "u1",
        feedId: "f1",
        title: "Dentist",
        start: "2026-07-21T14:00:00.000Z",
        end: "2026-07-21T15:00:00.000Z",
      })
    ).rejects.toThrow(/writable Google/);
  });

  it("rejects a calendar the user does not own (not found)", async () => {
    mockPrisma.calendarFeed.findUnique.mockResolvedValue(null);
    await expect(
      createEvent({
        userId: "u1",
        feedId: "nope",
        title: "x",
        start: "2026-07-21T14:00:00.000Z",
        end: "2026-07-21T15:00:00.000Z",
      })
    ).rejects.toThrow(/writable Google/);
  });
});
