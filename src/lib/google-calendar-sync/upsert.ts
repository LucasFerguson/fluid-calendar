import { Prisma } from "@prisma/client";
import { calendar_v3 } from "googleapis";

import { createAllDayDate, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

export type ChangeSource = "BACKFILL" | "INCREMENTAL" | "MANUAL";

export type UpsertOutcome =
  | "created"
  | "updated"
  | "cancelled"
  | "unchanged"
  | "skipped";

// Process recurrence rules (moved from the Google route handler so backfill,
// incremental sync and manual sync share one implementation).
export function processRecurrenceRule(
  recurrence: string[] | null | undefined,
  startDate?: Date
): string | undefined {
  if (!recurrence || recurrence.length === 0) return undefined;

  const rrule = recurrence.find((r) => r.startsWith("RRULE:"));
  if (!rrule) return undefined;

  // For yearly rules, ensure both BYMONTH and BYMONTHDAY are present
  if (rrule.includes("FREQ=YEARLY") && startDate) {
    const hasMonth = rrule.includes("BYMONTH=");
    const hasMonthDay = rrule.includes("BYMONTHDAY=");

    if (!hasMonth || !hasMonthDay) {
      let parts = rrule.split(";");
      parts = parts.filter(
        (part) =>
          !part.startsWith("BYMONTH=") && !part.startsWith("BYMONTHDAY=")
      );
      parts.push(`BYMONTH=${startDate.getMonth() + 1}`);
      parts.push(`BYMONTHDAY=${startDate.getDate()}`);
      return parts.join(";");
    }
  }

  return rrule;
}

async function recordChange(
  feedId: string,
  externalEventId: string,
  changeType: "CREATE" | "UPDATE" | "CANCELLED",
  event: calendar_v3.Schema$Event,
  source: ChangeSource
): Promise<void> {
  await prisma.calendarEventChange.create({
    data: {
      feedId,
      externalEventId,
      changeType,
      changeData: event as Prisma.InputJsonValue,
      source,
    },
  });
}

/**
 * Idempotently apply one observed Google event to the local archive:
 * upsert the CalendarEvent projection keyed on (feedId, externalEventId) and
 * append a CalendarEventChange row when something actually changed.
 *
 * Deletions never remove rows: Google reports them as status "cancelled" and
 * the row is kept with that status so the archive only ever grows.
 */
export async function upsertGoogleEvent(opts: {
  feedId: string;
  event: calendar_v3.Schema$Event;
  source: ChangeSource;
  isMaster?: boolean;
  masterId?: string | null;
}): Promise<UpsertOutcome> {
  const { feedId, event, source, isMaster = false, masterId = null } = opts;

  const externalEventId = event.id;
  if (!externalEventId) return "skipped";

  const existing = await prisma.calendarEvent.findUnique({
    where: { feedId_externalEventId: { feedId, externalEventId } },
  });

  // Cancelled (deleted in Google). Keep the row, flip status, log once.
  if (event.status === "cancelled") {
    if (existing) {
      if (existing.status === "cancelled") return "unchanged";
      await prisma.calendarEvent.update({
        where: { id: existing.id },
        data: {
          status: "cancelled",
          lastModified: event.updated ? newDate(event.updated) : undefined,
          sequence: event.sequence ?? undefined,
        },
      });
      await recordChange(feedId, externalEventId, "CANCELLED", event, source);
      return "cancelled";
    }
    // No local row (e.g. deleted before we ever archived it, or a cancelled
    // recurrence exception). Cancelled payloads usually carry no start/end so
    // there is nothing to project; during incremental sync still record that a
    // deletion was observed, during backfill skip quietly (showDeleted
    // re-surfaces these on every full pass).
    if (source === "INCREMENTAL") {
      await recordChange(feedId, externalEventId, "CANCELLED", event, source);
      return "cancelled";
    }
    return "skipped";
  }

  if (!event.start?.dateTime && !event.start?.date) return "skipped";

  // Skip rewriting rows whose provider payload hasn't changed since the last
  // observation, so re-running a full backfill doesn't flood the change log.
  if (
    existing &&
    event.updated &&
    existing.lastModified?.getTime() === newDate(event.updated).getTime() &&
    existing.status === (event.status ?? null) &&
    existing.isMaster === isMaster &&
    (existing.masterEventId ?? null) === (masterId ?? null)
  ) {
    return "unchanged";
  }

  const isAllDay = !event.start.dateTime;
  const start = isAllDay
    ? createAllDayDate(event.start.date || "")
    : newDate(event.start.dateTime || event.start.date || "");
  const end = isAllDay
    ? createAllDayDate(event.end?.date || "")
    : newDate(event.end?.dateTime || event.end?.date || "");

  const record = {
    title: event.summary || "Untitled Event",
    description: event.description || "",
    start,
    end,
    location: event.location,
    timeZone: event.start.timeZone || event.end?.timeZone || null,
    isRecurring: !!event.recurringEventId || !!event.recurrence,
    isMaster,
    masterEventId: masterId,
    recurringEventId: event.recurringEventId,
    // Instances inherit their rule from the master row; masters and
    // standalone recurring events carry it themselves.
    recurrenceRule: masterId
      ? undefined
      : processRecurrenceRule(event.recurrence, start),
    allDay: isAllDay,
    status: event.status,
    sequence: event.sequence,
    created: event.created ? newDate(event.created) : undefined,
    lastModified: event.updated ? newDate(event.updated) : undefined,
    organizer: event.organizer
      ? {
          name: event.organizer.displayName,
          email: event.organizer.email,
        }
      : undefined,
    attendees: event.attendees?.map((a: calendar_v3.Schema$EventAttendee) => ({
      name: a.displayName,
      email: a.email,
      status: a.responseStatus,
    })),
  };

  await prisma.calendarEvent.upsert({
    where: { feedId_externalEventId: { feedId, externalEventId } },
    create: { feedId, externalEventId, ...record },
    update: record,
  });

  await recordChange(
    feedId,
    externalEventId,
    existing ? "UPDATE" : "CREATE",
    event,
    source
  );
  return existing ? "updated" : "created";
}

/**
 * Find the DB id of the master row for a recurring series, with a per-run
 * cache supplied by the caller.
 */
export async function findMasterId(
  feedId: string,
  recurringEventId: string,
  cache: Map<string, string | null>
): Promise<string | null> {
  const cached = cache.get(recurringEventId);
  if (cached !== undefined) return cached;

  const master = await prisma.calendarEvent.findUnique({
    where: {
      feedId_externalEventId: { feedId, externalEventId: recurringEventId },
    },
    select: { id: true, isMaster: true },
  });
  const id = master?.isMaster ? master.id : null;
  cache.set(recurringEventId, id);
  return id;
}
