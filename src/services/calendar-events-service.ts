import {
  DEFAULT_LIMIT,
  buildCalendarEventsWhere,
} from "@/app/api/calendar/events/query";
import { writeGoogleEventToDatabase } from "@/lib/calendar/google-event-write";
import { formatInTimeZone, newDate } from "@/lib/date-utils";
import getGoogleEvent, { createGoogleEvent } from "@/lib/google-calendar";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "CalendarEventsService";

const DEFAULT_TIME_ZONE = "America/Chicago";

// Human-readable local time so weak models don't have to convert from UTC
// (all-day events show just the date).
function formatLocal(date: Date, timeZone: string, allDay: boolean): string {
  return allDay
    ? formatInTimeZone(date, timeZone, "EEE MMM d yyyy")
    : formatInTimeZone(date, timeZone, "EEE MMM d yyyy, h:mm a zzz");
}

// Canonical read/write path for calendar events on the agent/MCP surface. Reads
// reuse buildCalendarEventsWhere so the archived-event (status:"cancelled")
// exclusion and window-overlap logic stay defined in ONE place; writes reuse the
// same Google write path as the REST route.

export interface EventDTO {
  id: string;
  title: string;
  /** Local wall-clock time in the user's timezone (present this to the user). */
  startLocal: string;
  endLocal: string;
  timeZone: string;
  /** Precise UTC instants, for any programmatic use. */
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  status: string | null;
  isRecurring: boolean;
  calendar: string | null;
}

export interface ListEventsParams {
  userId: string;
  start: string;
  end: string;
  feedIds?: string[];
  limit?: number;
}

export async function listEvents(
  params: ListEventsParams
): Promise<EventDTO[]> {
  const { userId, start, end, feedIds } = params;
  const rangeStart = newDate(start);
  const rangeEnd = newDate(end);

  const where = buildCalendarEventsWhere({
    userId,
    rangeStart,
    rangeEnd,
    feedIds,
    enabledOnly: true,
    includeCancelled: false,
    includeMasters: false,
  });

  const [settings, events] = await Promise.all([
    prisma.userSettings.findUnique({
      where: { userId },
      select: { timeZone: true },
    }),
    prisma.calendarEvent.findMany({
      where,
      select: {
        id: true,
        title: true,
        start: true,
        end: true,
        allDay: true,
        location: true,
        status: true,
        isRecurring: true,
        feed: { select: { name: true } },
      },
      orderBy: { start: "asc" },
      take: Math.min(Math.max(params.limit ?? 250, 1), DEFAULT_LIMIT),
    }),
  ]);

  const tz = settings?.timeZone || DEFAULT_TIME_ZONE;

  return events.map((e) => ({
    id: e.id,
    title: e.title,
    startLocal: formatLocal(e.start, tz, e.allDay),
    endLocal: formatLocal(e.end, tz, e.allDay),
    timeZone: tz,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    allDay: e.allDay,
    location: e.location,
    status: e.status,
    isRecurring: e.isRecurring,
    calendar: e.feed?.name ?? null,
  }));
}

export interface CalendarDTO {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  color: string | null;
  canWrite: boolean;
}

export async function listCalendars(userId: string): Promise<CalendarDTO[]> {
  const feeds = await prisma.calendarFeed.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      type: true,
      enabled: true,
      color: true,
      url: true,
      accountId: true,
    },
    orderBy: { name: "asc" },
  });

  return feeds.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    enabled: f.enabled,
    color: f.color,
    // Only Google feeds with an account + calendar id can be written to today.
    canWrite: f.type === "GOOGLE" && !!f.url && !!f.accountId,
  }));
}

export interface CreateEventParams {
  userId: string;
  feedId: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  allDay?: boolean;
}

export interface CreatedEventDTO {
  created: true;
  calendar: string;
  events: { id: string; title: string; start: string; end: string }[];
}

export async function createEvent(
  params: CreateEventParams
): Promise<CreatedEventDTO> {
  const { userId, feedId } = params;

  const feed = await prisma.calendarFeed.findUnique({
    where: { id: feedId, userId },
    include: { account: true },
  });

  if (!feed || feed.type !== "GOOGLE" || !feed.url || !feed.accountId) {
    throw new Error(
      "Invalid calendar: events can only be created on a writable Google calendar. Use list_calendars to find one where canWrite is true."
    );
  }

  const googleEvent = await createGoogleEvent(feed.accountId, userId, feed.url, {
    title: params.title,
    description: params.description,
    location: params.location,
    start: newDate(params.start),
    end: newDate(params.end),
    allDay: params.allDay ?? false,
    isRecurring: false,
    recurrenceRule: undefined,
  });

  if (!googleEvent.id) {
    throw new Error("Failed to get event ID from Google Calendar");
  }

  const { event, instances } = await getGoogleEvent(
    feed.accountId,
    userId,
    feed.url,
    googleEvent.id
  );

  const records = await writeGoogleEventToDatabase(feed.id, event, instances);
  const rows = Array.isArray(records) ? records : records ? [records] : [];

  logger.info(
    "Agent created a calendar event",
    { userId, feedId, externalEventId: googleEvent.id },
    LOG_SOURCE
  );

  return {
    created: true,
    calendar: feed.name,
    events: rows.map((r) => ({
      id: r.id,
      title: r.title,
      start: r.start.toISOString(),
      end: r.end.toISOString(),
    })),
  };
}
