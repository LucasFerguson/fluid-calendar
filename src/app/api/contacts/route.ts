import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ContactsAPI";

// Everyone you've shared a calendar event with, aggregated from the relational
// EventAttendee table (one row per invited person per event). All aggregation
// happens in Postgres. Event starts are stored as naive UTC, so they are
// reinterpreted in the user's timezone for display:
// (start AT TIME ZONE 'UTC') AT TIME ZONE <tz>, returned as wall-clock ISO
// strings with no zone suffix.
//
// Rows only exist for events observed since the EventAttendee table was added;
// older events won't surface a contact until re-synced.
// TODO(attendee-backfill): covered by the roadmap backfill item.

// Wall-clock timestamp in the user's timezone, no zone suffix. (Next.js route
// files may only export handlers, so this is duplicated in contacts/[email].)
const LOCAL_ISO = 'YYYY-MM-DD"T"HH24:MI:SS';

interface ContactRow {
  email: string;
  name: string | null;
  meetings: number;
  first_met: string | null;
  last_meeting: string | null;
  next_meeting: string | null;
  company: string | null;
  job_title: string | null;
  photo_url: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const userId = auth.userId;

    const [settings, user] = await Promise.all([
      prisma.userSettings.findUnique({
        where: { userId: userId ?? "" },
        select: { timeZone: true },
      }),
      prisma.user.findUnique({
        where: { id: userId ?? "" },
        select: { email: true },
      }),
    ]);
    const tz = settings?.timeZone || "UTC";
    // The user appears as an attendee of their own events (usually flagged
    // isSelf, but also by email when invited via a different calendar).
    const ownEmail = (user?.email ?? "").toLowerCase();

    // Two sources, joined on email: contacts derived from calendar attendees
    // (agg) and the CRM profile overlay (prof, see prisma/schema.prisma). A
    // FULL OUTER JOIN keeps CRM-only contacts (imported but not yet met, so
    // meetings = 0 and all dates null) as well as met-but-un-enriched ones.
    // The profile name override wins over the attendee-derived name.
    const contacts = await prisma.$queryRaw<ContactRow[]>`
      WITH agg AS (
        SELECT lower(a.email) AS email,
               max(a.name) AS name,
               count(DISTINCT e.id)::int AS meetings,
               to_char((min(e.start) AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, ${LOCAL_ISO}) AS first_met,
               to_char((max(e.start) FILTER (WHERE e.start <= now() AT TIME ZONE 'UTC')
                        AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, ${LOCAL_ISO}) AS last_meeting,
               to_char((min(e.start) FILTER (WHERE e.start >  now() AT TIME ZONE 'UTC')
                        AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, ${LOCAL_ISO}) AS next_meeting
        FROM "EventAttendee" a
        JOIN "CalendarEvent" e ON e.id = a."eventId"
        JOIN "CalendarFeed"  f ON f.id = e."feedId"
        WHERE f."userId" = ${userId}
          AND (e.status IS NULL OR e.status <> 'cancelled')
          AND a."isSelf" = false
          AND a."isResource" = false
          AND a.email IS NOT NULL
          AND lower(a.email) <> ${ownEmail}
        GROUP BY lower(a.email)
      ),
      prof AS (
        SELECT email, name, company, title, "photoUrl"
        FROM "ContactProfile"
        WHERE "userId" = ${userId} AND email <> ${ownEmail}
      )
      SELECT COALESCE(agg.email, prof.email) AS email,
             COALESCE(prof.name, agg.name) AS name,
             COALESCE(agg.meetings, 0) AS meetings,
             agg.first_met, agg.last_meeting, agg.next_meeting,
             prof.company,
             prof.title AS job_title,
             prof."photoUrl" AS photo_url
      FROM agg
      FULL OUTER JOIN prof ON prof.email = agg.email
      ORDER BY agg.last_meeting DESC NULLS LAST,
               agg.next_meeting ASC NULLS LAST,
               COALESCE(agg.email, prof.email)`;

    return NextResponse.json({
      timeZone: tz,
      contacts: contacts.map((r) => ({
        email: r.email,
        name: r.name,
        meetings: r.meetings,
        firstMet: r.first_met,
        lastMeeting: r.last_meeting,
        nextMeeting: r.next_meeting,
        company: r.company,
        title: r.job_title,
        photoUrl: r.photo_url,
      })),
    });
  } catch (error) {
    logger.error(
      "Failed to compute contacts",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to compute contacts" },
      { status: 500 }
    );
  }
}
