import { prisma } from "@/lib/prisma";

// Canonical read path for the lightweight archive/contact counters exposed to
// the agent/MCP surface (a cheaper subset of the full Statistics-page query).

export interface ArchiveStatsDTO {
  eventsArchived: number;
  deletionsPreserved: number;
  auditEntries: number;
  calendars: number;
  contacts: number;
}

export async function getArchiveStats(
  userId: string
): Promise<ArchiveStatsDTO> {
  const [eventsArchived, deletionsPreserved, auditEntries, calendars, people] =
    await Promise.all([
      prisma.calendarEvent.count({
        where: {
          feed: { userId },
          OR: [{ status: null }, { status: { not: "cancelled" } }],
        },
      }),
      prisma.calendarEvent.count({
        where: { feed: { userId }, status: "cancelled" },
      }),
      prisma.calendarEventChange.count({ where: { feed: { userId } } }),
      prisma.calendarFeed.count({ where: { userId } }),
      prisma.$queryRaw<{ people: number }[]>`
        SELECT count(DISTINCT lower(ea.email))::int AS people
        FROM "EventAttendee" ea
        JOIN "CalendarEvent" e ON e.id = ea."eventId"
        JOIN "CalendarFeed" f ON f.id = e."feedId"
        WHERE f."userId" = ${userId} AND ea.email IS NOT NULL
      `,
    ]);

  return {
    eventsArchived,
    deletionsPreserved,
    auditEntries,
    calendars,
    contacts: Number(people[0]?.people ?? 0),
  };
}
