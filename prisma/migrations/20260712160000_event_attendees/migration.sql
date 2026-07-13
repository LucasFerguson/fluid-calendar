-- Relational, queryable attendees (one row per invited person/resource).
CREATE TABLE "EventAttendee" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "responseStatus" TEXT,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "isOrganizer" BOOLEAN NOT NULL DEFAULT false,
    "isSelf" BOOLEAN NOT NULL DEFAULT false,
    "isResource" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "additionalGuests" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventAttendee_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EventAttendee_eventId_idx" ON "EventAttendee"("eventId");
CREATE INDEX "EventAttendee_email_idx" ON "EventAttendee"("email");
ALTER TABLE "EventAttendee" ADD CONSTRAINT "EventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
