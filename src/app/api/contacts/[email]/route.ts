import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ContactDetailAPI";

// One contact, addressed by email (matched case-insensitively):
//  - GET: all shared events (oldest first) plus the ContactProfile overlay.
//    Starts are wall-clock ISO strings in the user's timezone (see
//    /api/contacts); is_past is computed in SQL against the same naive-UTC
//    clock the starts are stored in, so the client never compares timezones.
//  - PUT: upsert CRM enrichment fields (company, photo, ...) with merge
//    semantics - omitted fields are unchanged, explicit null clears. Intended
//    for external integrations via write-scoped API keys.
//  - DELETE: remove the enrichment profile (the derived contact remains).

// Wall-clock timestamp in the user's timezone, no zone suffix.
const LOCAL_ISO = 'YYYY-MM-DD"T"HH24:MI:SS';

// Every field optional (merge) and nullable (null clears it).
const profileSchema = z
  .object({
    name: z.string().max(200).nullable().optional(),
    company: z.string().max(200).nullable().optional(),
    title: z.string().max(200).nullable().optional(),
    phone: z.string().max(50).nullable().optional(),
    photoUrl: z.string().url().max(2000).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .strict();

const PROFILE_SELECT = {
  email: true,
  name: true,
  company: true,
  title: true,
  phone: true,
  photoUrl: true,
  notes: true,
  updatedAt: true,
} as const;

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

    const [events, names, profile] = await Promise.all([
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
      prisma.contactProfile.findUnique({
        where: { userId_email: { userId: userId ?? "", email } },
        select: PROFILE_SELECT,
      }),
    ]);

    return NextResponse.json({
      timeZone: tz,
      email,
      name: profile?.name ?? names[0]?.name ?? null,
      profile,
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const userId = auth.userId;
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { email: rawEmail } = await params;
    const email = decodeURIComponent(rawEmail).toLowerCase();
    if (!email.includes("@")) {
      return NextResponse.json(
        { error: "Invalid contact email" },
        { status: 400 }
      );
    }

    const parsed = profileSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid profile", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const profile = await prisma.contactProfile.upsert({
      where: { userId_email: { userId, email } },
      create: { userId, email, ...parsed.data },
      update: parsed.data,
      select: PROFILE_SELECT,
    });

    logger.info("Contact profile upserted", { email }, LOG_SOURCE);
    return NextResponse.json({ email, profile });
  } catch (error) {
    logger.error(
      "Failed to update contact profile",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to update contact profile" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const userId = auth.userId;
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { email: rawEmail } = await params;
    const email = decodeURIComponent(rawEmail).toLowerCase();

    const deleted = await prisma.contactProfile.deleteMany({
      where: { userId, email },
    });
    if (deleted.count === 0) {
      return NextResponse.json(
        { error: "No profile for this contact" },
        { status: 404 }
      );
    }

    logger.info("Contact profile deleted", { email }, LOG_SOURCE);
    return NextResponse.json({ email, deleted: true });
  } catch (error) {
    logger.error(
      "Failed to delete contact profile",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to delete contact profile" },
      { status: 500 }
    );
  }
}
