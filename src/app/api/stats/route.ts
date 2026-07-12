import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "StatsAPI";

// Aggregated statistics over the local calendar archive. All heavy lifting is
// done in Postgres (no event rows cross the wire). Timestamps are stored as
// naive UTC, so hour/day/year extraction reinterprets them in the user's
// timezone: (start AT TIME ZONE 'UTC') AT TIME ZONE <tz>.
//
// TODO(stats-filter): accept an optional ?calendarIds= filter and AND it into
// every aggregation. Subscribed/imported calendars (US Holidays, school
// schedules) pile many same-time events onto the heatmap and inflate the
// per-year counts, drowning out the user's own calendars; a calendar filter
// (default: personal/owned calendars only) would make the "when your events
// happen" view reflect actual behavior rather than subscription noise.

interface CountRow {
  count: bigint;
}
interface YearRow {
  yr: number;
  c: bigint;
}
interface HeatRow {
  dow: number;
  hour: number;
  c: bigint;
}
interface CalendarRow {
  id: string;
  name: string;
  color: string | null;
  c: bigint;
}
interface RangeRow {
  oldest: Date | null;
  newest: Date | null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const userId = auth.userId;

    const settings = await prisma.userSettings.findUnique({
      where: { userId: userId ?? "" },
      select: { timeZone: true },
    });
    const tz = settings?.timeZone || "UTC";

    // A single round trip: run every aggregation in parallel.
    const [
      totals,
      cancelled,
      auditCount,
      range,
      perYear,
      heatmap,
      perCalendar,
    ] = await Promise.all([
      prisma.$queryRaw<CountRow[]>`
        SELECT count(*)::bigint AS count
        FROM "CalendarEvent" e
        JOIN "CalendarFeed" f ON f.id = e."feedId"
        WHERE f."userId" = ${userId}
          AND (e.status IS NULL OR e.status <> 'cancelled')`,
      prisma.$queryRaw<CountRow[]>`
        SELECT count(*)::bigint AS count
        FROM "CalendarEvent" e
        JOIN "CalendarFeed" f ON f.id = e."feedId"
        WHERE f."userId" = ${userId} AND e.status = 'cancelled'`,
      prisma.$queryRaw<CountRow[]>`
        SELECT count(*)::bigint AS count
        FROM "CalendarEventChange" c
        JOIN "CalendarFeed" f ON f.id = c."feedId"
        WHERE f."userId" = ${userId}`,
      prisma.$queryRaw<RangeRow[]>`
        SELECT min(e.start) AS oldest, max(e.start) AS newest
        FROM "CalendarEvent" e
        JOIN "CalendarFeed" f ON f.id = e."feedId"
        WHERE f."userId" = ${userId}
          AND (e.status IS NULL OR e.status <> 'cancelled')
          AND e."allDay" = false`,
      prisma.$queryRaw<YearRow[]>`
        SELECT EXTRACT(YEAR FROM (e.start AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::int AS yr,
               count(*)::bigint AS c
        FROM "CalendarEvent" e
        JOIN "CalendarFeed" f ON f.id = e."feedId"
        WHERE f."userId" = ${userId}
          AND (e.status IS NULL OR e.status <> 'cancelled')
        GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<HeatRow[]>`
        SELECT EXTRACT(DOW  FROM (e.start AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::int AS dow,
               EXTRACT(HOUR FROM (e.start AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::int AS hour,
               count(*)::bigint AS c
        FROM "CalendarEvent" e
        JOIN "CalendarFeed" f ON f.id = e."feedId"
        WHERE f."userId" = ${userId}
          AND (e.status IS NULL OR e.status <> 'cancelled')
          AND e."allDay" = false
        GROUP BY 1, 2`,
      prisma.$queryRaw<CalendarRow[]>`
        SELECT f.id, f.name, f.color,
               count(e.id) FILTER (
                 WHERE e.status IS NULL OR e.status <> 'cancelled'
               )::bigint AS c
        FROM "CalendarFeed" f
        LEFT JOIN "CalendarEvent" e ON e."feedId" = f.id
        WHERE f."userId" = ${userId} AND f.type = 'GOOGLE'
        GROUP BY f.id, f.name, f.color
        ORDER BY c DESC`,
    ]);

    // Densify the heatmap into a 7 (Sun..Sat) x 24 grid of plain numbers.
    const grid: number[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => 0)
    );
    for (const row of heatmap) {
      grid[row.dow][row.hour] = Number(row.c);
    }

    return NextResponse.json({
      timeZone: tz,
      totals: {
        events: Number(totals[0]?.count ?? 0),
        cancelled: Number(cancelled[0]?.count ?? 0),
        auditEntries: Number(auditCount[0]?.count ?? 0),
        oldest: range[0]?.oldest ?? null,
        newest: range[0]?.newest ?? null,
      },
      perYear: perYear.map((r) => ({ year: r.yr, count: Number(r.c) })),
      perCalendar: perCalendar.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        count: Number(r.c),
      })),
      heatmap: grid,
    });
  } catch (error) {
    logger.error(
      "Failed to compute stats",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to compute stats" },
      { status: 500 }
    );
  }
}
