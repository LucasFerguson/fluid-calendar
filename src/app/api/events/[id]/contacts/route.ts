import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "EventContactsAPI";

// Contacts attached to an event for organization only (see the EventContact
// model). These never touch the Google sync, so nothing here becomes a real
// attendee or invitation. All ops verify the event belongs to the caller by
// joining through its feed's userId.

const attachSchema = z.object({
  email: z.string().email(),
  name: z.string().max(200).nullable().optional(),
});

async function ownsEvent(eventId: string, userId: string): Promise<boolean> {
  const event = await prisma.calendarEvent.findFirst({
    where: { id: eventId, feed: { userId } },
    select: { id: true },
  });
  return !!event;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;
    const userId = auth.userId;
    const { id } = await params;

    if (!userId || !(await ownsEvent(id, userId))) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const contacts = await prisma.eventContact.findMany({
      where: { eventId: id },
      orderBy: { createdAt: "asc" },
      select: { email: true, name: true, createdAt: true },
    });
    return NextResponse.json({ contacts });
  } catch (error) {
    logger.error(
      "Failed to list event contacts",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to list event contacts" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;
    const userId = auth.userId;
    const { id } = await params;

    if (!userId || !(await ownsEvent(id, userId))) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const parsed = attachSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid contact", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const email = parsed.data.email.toLowerCase();

    const contact = await prisma.eventContact.upsert({
      where: { eventId_email: { eventId: id, email } },
      create: { eventId: id, email, name: parsed.data.name ?? null },
      update: { name: parsed.data.name ?? null },
      select: { email: true, name: true, createdAt: true },
    });
    return NextResponse.json({ contact });
  } catch (error) {
    logger.error(
      "Failed to attach event contact",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to attach event contact" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;
    const userId = auth.userId;
    const { id } = await params;

    if (!userId || !(await ownsEvent(id, userId))) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const email = request.nextUrl.searchParams.get("email")?.toLowerCase();
    if (!email) {
      return NextResponse.json(
        { error: "email query parameter is required" },
        { status: 400 }
      );
    }

    await prisma.eventContact.deleteMany({ where: { eventId: id, email } });
    return NextResponse.json({ email, detached: true });
  } catch (error) {
    logger.error(
      "Failed to detach event contact",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to detach event contact" },
      { status: 500 }
    );
  }
}
