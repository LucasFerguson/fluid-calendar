import { NextRequest, NextResponse } from "next/server";

import { GaxiosError } from "gaxios";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { writeGoogleEventToDatabase } from "@/lib/calendar/google-event-write";
import {
  deleteCalendarEvent,
  getEvent,
  validateEvent,
} from "@/lib/calendar-db";
import { newDate } from "@/lib/date-utils";
import getGoogleEvent, {
  createGoogleEvent,
  deleteGoogleEvent,
  updateGoogleEvent,
} from "@/lib/google-calendar";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "GoogleEventsAPI";

// The shared write path lives in @/lib/calendar/google-event-write so the
// agent/MCP create-event service persists rows identically to this route.
const writeEventToDatabase = writeGoogleEventToDatabase;

// Create a new event
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { feedId, ...eventData } = await request.json();

    // Check if the feed belongs to the current user
    const feed = await prisma.calendarFeed.findUnique({
      where: {
        id: feedId,
        userId,
      },
      include: {
        account: true,
      },
    });

    if (!feed || feed.type !== "GOOGLE" || !feed.url || !feed.accountId) {
      return NextResponse.json(
        { error: "Invalid calendar feed" },
        { status: 400 }
      );
    }

    // Create event in Google Calendar
    const googleEvent = await createGoogleEvent(
      feed.accountId,
      userId,
      feed.url,
      {
        title: eventData.title,
        description: eventData.description,
        location: eventData.location,
        start: newDate(eventData.start),
        end: newDate(eventData.end),
        allDay: eventData.allDay,
        isRecurring: eventData.isRecurring,
        recurrenceRule: eventData.recurrenceRule,
      }
    );

    if (!googleEvent.id) {
      throw new Error("Failed to get event ID from Google Calendar");
    }

    // Sync the new event to our database
    const { event, instances } = await getGoogleEvent(
      feed.accountId,
      userId,
      feed.url,
      googleEvent.id
    );

    // Create the event record(s) in our database
    const records = await writeEventToDatabase(feed.id, event, instances);

    return NextResponse.json(records);
  } catch (error) {
    logger.error(
      "Failed to create Google calendar event:",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    if (error instanceof GaxiosError && Number(error.code) === 401) {
      return NextResponse.json(
        { error: "Authentication failed. Please try signing in again." },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 }
    );
  }
}

// Update an event
export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { eventId, mode, ...updates } = await request.json();
    if (!eventId) {
      return NextResponse.json({ error: "Event ID required" }, { status: 400 });
    }

    const event = await getEvent(eventId);

    // Check if the event belongs to a feed owned by the current user
    if (event && event.feed.userId !== userId) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const validatedEvent = await validateEvent(event, "GOOGLE");

    if (validatedEvent instanceof NextResponse) {
      return validatedEvent;
    }

    // Update in Google Calendar
    const googleEvent = await updateGoogleEvent(
      validatedEvent.feed.accountId,
      userId,
      validatedEvent.feed.url,
      validatedEvent.externalEventId,
      {
        ...updates,
        mode,
        start: updates.start ? newDate(updates.start) : undefined,
        end: updates.end ? newDate(updates.end) : undefined,
      }
    );

    if (!googleEvent.id) {
      throw new Error("Failed to get event ID from Google Calendar");
    }

    // Re-fetch the updated event/instances from Google and upsert them in
    // place. (Previously this delete-then-recreate'd, which broke once local
    // deletes became soft-cancels under the archival model and the
    // feedId+externalEventId unique constraint was added.)
    const { event: updatedEvent, instances } = await getGoogleEvent(
      validatedEvent.feed.accountId,
      userId,
      validatedEvent.feed.url,
      googleEvent.id
    );

    // Create new records in our database
    const records = await writeEventToDatabase(
      validatedEvent.feed.id,
      updatedEvent,
      instances
    );

    return NextResponse.json(records);
  } catch (error) {
    logger.error(
      "Failed to update Google calendar event:",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    if (error instanceof GaxiosError && Number(error.code) === 401) {
      return NextResponse.json(
        { error: "Authentication failed. Please try signing in again." },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: "Failed to update event" },
      { status: 500 }
    );
  }
}

// Delete an event
export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { eventId, mode } = await request.json();
    if (!eventId) {
      return NextResponse.json({ error: "Event ID required" }, { status: 400 });
    }

    const event = await getEvent(eventId);

    // Check if the event belongs to a feed owned by the current user
    if (event && event.feed.userId !== userId) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const validatedEvent = await validateEvent(event, "GOOGLE");

    if (validatedEvent instanceof NextResponse) {
      return validatedEvent;
    }

    // Delete from Google Calendar
    await deleteGoogleEvent(
      validatedEvent.feed.accountId,
      userId,
      validatedEvent.feed.url,
      validatedEvent.externalEventId,
      mode
    );

    // Delete from database using shared function
    await deleteCalendarEvent(validatedEvent.id, mode);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error(
      "Failed to delete Google calendar event:",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    if (error instanceof GaxiosError && Number(error.code) === 401) {
      return NextResponse.json(
        { error: "Authentication failed. Please try signing in again." },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: "Failed to delete event" },
      { status: 500 }
    );
  }
}
