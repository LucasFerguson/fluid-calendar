import { Prisma } from "@prisma/client";
import { calendar_v3 } from "googleapis";

import { enrichAttendees, writeAttendeeRecords } from "@/lib/calendar-attendees";
import { createAllDayDate, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

type GoogleEvent = calendar_v3.Schema$Event;

/**
 * Persist a Google event (and its instances, for recurring series) into our
 * local DB. This is the single write path shared by the Google events API route
 * and the agent/MCP create-event service, so both create rows identically.
 *
 * Upsert (not create) on the (feedId, externalEventId) unique key: after an
 * edit/move the row already exists, and upsert also un-cancels a previously
 * soft-cancelled row.
 */
export async function writeGoogleEventToDatabase(
  feedId: string,
  event: GoogleEvent,
  instances?: GoogleEvent[]
) {
  const isRecurring = !!event.recurrence;
  const isAllDay = event.start ? !event.start.dateTime : false;

  if (!isRecurring) {
    if (!event.id) return null;
    const data = {
      feedId,
      externalEventId: event.id,
      title: event.summary || "Untitled Event",
      description: event.description || "",
      start: isAllDay
        ? createAllDayDate(event.start?.date || "")
        : newDate(event.start?.dateTime || event.start?.date || ""),
      end: isAllDay
        ? createAllDayDate(event.end?.date || "")
        : newDate(event.end?.dateTime || event.end?.date || ""),
      location: event.location,
      isRecurring: isRecurring,
      recurrenceRule: event.recurrence?.[0],
      allDay: isAllDay,
      status: event.status,
      sequence: event.sequence,
      created: event.created ? newDate(event.created) : undefined,
      lastModified: event.updated ? newDate(event.updated) : undefined,
      organizer: event.organizer
        ? { name: event.organizer.displayName, email: event.organizer.email }
        : undefined,
      attendees: enrichAttendees(event.attendees) as
        | Prisma.InputJsonValue
        | undefined,
    };
    const row = await prisma.calendarEvent.upsert({
      where: { feedId_externalEventId: { feedId, externalEventId: event.id } },
      create: data,
      update: data,
    });
    await writeAttendeeRecords(row.id, event.attendees);
    return row;
  }

  const createdInstances = [];
  if (instances) {
    for (const instance of instances) {
      if (!instance.id) continue;
      const instanceIsAllDay = instance.start
        ? !instance.start.dateTime
        : false;

      const data = {
        feedId,
        externalEventId: instance.id,
        title: instance.summary || "Untitled Event",
        description: instance.description || "",
        start: instanceIsAllDay
          ? createAllDayDate(instance.start?.date || "")
          : newDate(instance.start?.dateTime || instance.start?.date || ""),
        end: instanceIsAllDay
          ? createAllDayDate(instance.end?.date || "")
          : newDate(instance.end?.dateTime || instance.end?.date || ""),
        location: instance.location,
        isRecurring: true,
        recurrenceRule: event.recurrence?.[0],
        recurringEventId: instance.recurringEventId,
        allDay: instanceIsAllDay,
        status: instance.status,
        sequence: instance.sequence,
        created: instance.created ? newDate(instance.created) : undefined,
        lastModified: instance.updated ? newDate(instance.updated) : undefined,
        organizer: instance.organizer
          ? {
              name: instance.organizer.displayName,
              email: instance.organizer.email,
            }
          : undefined,
        attendees: enrichAttendees(instance.attendees) as
          | Prisma.InputJsonValue
          | undefined,
      };
      const createdInstance = await prisma.calendarEvent.upsert({
        where: {
          feedId_externalEventId: { feedId, externalEventId: instance.id },
        },
        create: data,
        update: data,
      });
      await writeAttendeeRecords(createdInstance.id, instance.attendees);
      createdInstances.push(createdInstance);
    }
  }

  return createdInstances;
}
