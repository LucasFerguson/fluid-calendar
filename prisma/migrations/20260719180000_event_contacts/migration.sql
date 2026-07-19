-- Locally attached contacts for events (organizational only; never synced to
-- Google, never an attendee/invite).
CREATE TABLE "EventContact" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventContact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventContact_eventId_email_key" ON "EventContact"("eventId", "email");
CREATE INDEX "EventContact_eventId_idx" ON "EventContact"("eventId");
CREATE INDEX "EventContact_email_idx" ON "EventContact"("email");
ALTER TABLE "EventContact" ADD CONSTRAINT "EventContact_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
