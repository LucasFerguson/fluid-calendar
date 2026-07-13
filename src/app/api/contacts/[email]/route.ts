import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ContactDetailAPI";

// All events shared with one contact (matched case-insensitively by attendee
// email), oldest first. Starts are returned as wall-clock ISO strings in the
// user's timezone (see /api/contacts); is_past is computed in SQL against the
// same naive-UTC clock the starts are stored in, so the client never has to
// compare timezones itself.

// Wall-clock timestamp in the user's timezone, no zone suffix.
const LOCAL_ISO = 'YYYY-MM-DD"T"HH24:MI:SS';

interface EventRow {
  id: string;
  title: string | null;
  start_local: string;
  all_day: boolean;
  is_past: boolean;
  response_status: string | null;
  calendar_name: string;
  calendar_color: string | null;
}

interface NameRow {
  name: string | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const userId = auth.userId;

    const { email: rawEmail } = await params;
    const email = decodeURIComponent(rawEmail).toLowerCase();

    const settings = await prisma.userSettings.findUnique({
      where: { userId: userId ?? "" },
      select: { timeZone: true },
    });
    const tz = settings?.timeZone || "UTC";

    const [events, names] = await Promise.all([
      prisma.$queryRaw<EventRow[]>`
        SELECT e.id,
               e.title,
               to_char((e.start AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, ${LOCAL_ISO}) AS start_local,
               e."allDay" AS all_day,
               (e.start <= now() AT TIME ZONE 'UTC') AS is_past,
               a."responseStatus" AS response_status,
               f.name AS calendar_name,
               f.color AS calendar_color
        FROM "EventAttendee" a
        JOIN "CalendarEvent" e ON e.id = a."eventId"
        JOIN "CalendarFeed"  f ON f.id = e."feedId"
        WHERE f."userId" = ${userId}
          AND (e.status IS NULL OR e.status <> 'cancelled')
          AND lower(a.email) = ${email}
        ORDER BY e.start ASC`,
      prisma.$queryRaw<NameRow[]>`
        SELECT max(a.name) AS name
        FROM "EventAttendee" a
        JOIN "CalendarEvent" e ON e.id = a."eventId"
        JOIN "CalendarFeed"  f ON f.id = e."feedId"
        WHERE f."userId" = ${userId} AND lower(a.email) = ${email}`,
    ]);

    return NextResponse.json({
      timeZone: tz,
      email,
      name: names[0]?.name ?? null,
      events: events.map((r) => ({
        id: r.id,
        title: r.title,
        start: r.start_local,
        allDay: r.all_day,
        isPast: r.is_past,
        responseStatus: r.response_status,
        calendarName: r.calendar_name,
        calendarColor: r.calendar_color,
      })),
    });
  } catch (error) {
    logger.error(
      "Failed to fetch contact detail",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to fetch contact detail" },
      { status: 500 }
    );
  }
}
