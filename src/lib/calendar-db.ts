import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

import {
  AttendeeStatus,
  CalendarEventWithFeed,
  EventStatus,
  ValidatedEvent,
} from "@/types/calendar";

export async function getEvent(
  eventId: string
): Promise<CalendarEventWithFeed | null> {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    include: { feed: true },
  });

  if (!event) return null;

  // Map Prisma result to our CalendarEventWithFeed type
  return {
    ...event,
    externalEventId: event.externalEventId || undefined,
    description: event.description || undefined,
    location: event.location || undefined,
    recurrenceRule: event.recurrenceRule || undefined,
    sequence: event.sequence || undefined,
    status: (event.status as EventStatus) || undefined,
    created: event.created || undefined,
    lastModified: event.lastModified || undefined,
    organizer: event.organizer as { name?: string; email?: string } | undefined,
    attendees: event.attendees as
      | Array<{ name?: string; email: string; status?: AttendeeStatus }>
      | undefined,
    masterEventId: event.masterEventId || undefined,
    recurringEventId: event.recurringEventId || undefined,
    feed: {
      ...event.feed,
      type: event.feed.type as "GOOGLE" | "OUTLOOK" | "CALDAV",
      url: event.feed.url || undefined,
      color: event.feed.color || undefined,
      lastSync: event.feed.lastSync || undefined,
      error: event.feed.error || undefined,
      caldavPath: event.feed.caldavPath || undefined,
      accountId: event.feed.accountId || undefined,
      syncToken: event.feed.syncToken || undefined,
      userId: event.feed.userId || undefined,
    },
  };
}

export async function validateEvent(
  event: CalendarEventWithFeed | null,
  provider: "GOOGLE" | "OUTLOOK" | "CALDAV"
): Promise<ValidatedEvent | NextResponse> {
  if (!event || !event.feed || !event.feed.accountId) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.feed.type !== provider) {
    return NextResponse.json(
      { error: `Not a ${provider} Calendar event` },
      { status: 400 }
    );
  }

  // For CalDAV, we need either a URL or a caldavPath
  if (provider === "CALDAV" && !event.feed.caldavPath && !event.feed.url) {
    return NextResponse.json(
      { error: "No CalDAV calendar path found" },
      { status: 400 }
    );
  } else if (provider !== "CALDAV" && !event.feed.url) {
    return NextResponse.json(
      { error: "No calendar URL found" },
      { status: 400 }
    );
  }

  if (!event.externalEventId) {
    return NextResponse.json(
      { error: `No ${provider} Calendar event ID found` },
      { status: 400 }
    );
  }

  return event as ValidatedEvent;
}

export async function deleteCalendarEvent(
  eventId: string,
  mode: "single" | "series" | "thisAndFollowing" = "single"
) {
  const event = await getEvent(eventId);

  if (!event) {
    throw new Error("Event not found");
  }

  // Google feeds are a full archive: locally-initiated deletes soft-cancel
  // the rows (mirroring how provider-side deletes arrive as status
  // "cancelled") so history is never removed. Other feed types keep the
  // original hard-delete semantics.
  const softCancel = event.feed.type === "GOOGLE";

  if (softCancel && event.externalEventId) {
    // The incremental sync will later observe this cancellation as
    // "unchanged" (the row is already cancelled), so record the audit-log
    // entry for the locally-initiated delete here.
    await prisma.calendarEventChange.create({
      data: {
        feedId: event.feedId,
        externalEventId: event.externalEventId,
        changeType: "CANCELLED",
        changeData: { status: "cancelled", origin: "local-delete", mode },
        source: "MANUAL",
      },
    });
  }

  const removeById = async (id: string) => {
    if (softCancel) {
      await prisma.calendarEvent.update({
        where: { id },
        data: { status: "cancelled" },
      });
    } else {
      await prisma.calendarEvent.delete({ where: { id } });
    }
  };

  const masterId =
    event.isMaster || !event.masterEventId ? event.id : event.masterEventId;

  if (mode === "series") {
    // Remove the event and any related instances from our database
    if (softCancel) {
      // Cancelling doesn't cascade like a delete; cancel instances too.
      await prisma.calendarEvent.updateMany({
        where: { OR: [{ id: masterId }, { masterEventId: masterId }] },
        data: { status: "cancelled" },
      });
    } else {
      //deleting the master event will cascade to all instances
      await prisma.calendarEvent.delete({
        where: {
          id: masterId,
        },
      });
    }
  } else if (mode === "thisAndFollowing") {
    // Optimistically soft-cancel this occurrence and every later one in the
    // series (Google truncates the master RRULE; the next incremental sync
    // reconciles the master's rule and confirms these cancellations). Only
    // meaningful for the soft-cancel (Google) path; other providers fall back
    // to a single delete.
    if (softCancel) {
      await prisma.calendarEvent.updateMany({
        where: {
          masterEventId: masterId,
          start: { gte: event.start },
          status: { not: "cancelled" },
        },
        data: { status: "cancelled" },
      });
      // The clicked row itself, if it is the master rather than an instance.
      if (event.isMaster) {
        await prisma.calendarEvent.update({
          where: { id: event.id },
          data: { status: "cancelled" },
        });
      }
    } else {
      await removeById(event.id);
    }
  } else {
    //remove a single instance
    await removeById(event.id);
  }

  return event;
}
