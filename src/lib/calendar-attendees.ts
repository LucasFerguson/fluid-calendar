import { calendar_v3 } from "googleapis";

import { prisma } from "@/lib/prisma";

// Attendee handling shared by the archival sync and the create/edit routes.
// We keep two representations in sync:
//   - a denormalized JSON blob on CalendarEvent.attendees (what the calendar UI
//     reads directly), now enriched beyond name/email/status
//   - relational EventAttendee rows (queryable for analytics like "every event
//     with X" or contact frequency)

export interface EnrichedAttendee {
  name?: string | null;
  email?: string | null;
  status?: string | null;
  optional?: boolean;
  organizer?: boolean;
  self?: boolean;
  resource?: boolean;
  comment?: string | null;
  additionalGuests?: number | null;
}

/** Enriched JSON attendees for the CalendarEvent.attendees column. */
export function enrichAttendees(
  attendees?: calendar_v3.Schema$EventAttendee[] | null
): EnrichedAttendee[] | undefined {
  if (!attendees) return undefined;
  return attendees.map((a) => ({
    name: a.displayName ?? null,
    email: a.email ?? null,
    status: a.responseStatus ?? null,
    optional: a.optional ?? false,
    organizer: a.organizer ?? false,
    self: a.self ?? false,
    resource: a.resource ?? false,
    comment: a.comment ?? null,
    additionalGuests: a.additionalGuests ?? null,
  }));
}

/**
 * Rebuild the relational EventAttendee rows for an event from the provider
 * payload. No-op when the payload omits attendees (Google omits the field when
 * there are none) so we never clobber existing rows on unrelated updates.
 */
export async function writeAttendeeRecords(
  eventDbId: string,
  attendees?: calendar_v3.Schema$EventAttendee[] | null
): Promise<void> {
  if (!attendees) return;
  await prisma.eventAttendee.deleteMany({ where: { eventId: eventDbId } });
  if (attendees.length === 0) return;
  await prisma.eventAttendee.createMany({
    data: attendees.map((a) => ({
      eventId: eventDbId,
      email: a.email ?? null,
      name: a.displayName ?? null,
      responseStatus: a.responseStatus ?? null,
      optional: a.optional ?? false,
      isOrganizer: a.organizer ?? false,
      isSelf: a.self ?? false,
      isResource: a.resource ?? false,
      comment: a.comment ?? null,
      additionalGuests: a.additionalGuests ?? null,
    })),
  });
}
