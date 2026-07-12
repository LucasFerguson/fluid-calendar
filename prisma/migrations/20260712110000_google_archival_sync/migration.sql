-- Google Calendar archival sync: idempotent event identity, original-timezone
-- preservation, resumable backfill state, and an append-only change log.

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "timeZone" TEXT;

-- AlterTable
ALTER TABLE "CalendarFeed" ADD COLUMN     "backfillComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "backfillCursor" TIMESTAMP(3),
ADD COLUMN     "backfillError" TEXT;

-- CreateTable
CREATE TABLE "CalendarEventChange" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "changeData" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEventChange_feedId_idx" ON "CalendarEventChange"("feedId");

-- CreateIndex
CREATE INDEX "CalendarEventChange_externalEventId_idx" ON "CalendarEventChange"("externalEventId");

-- CreateIndex
CREATE INDEX "CalendarEventChange_timestamp_idx" ON "CalendarEventChange"("timestamp");

-- CreateIndex
CREATE INDEX "CalendarEventChange_changeType_idx" ON "CalendarEventChange"("changeType");

-- Dedupe before adding the unique constraint: databases that went through the
-- old delete-all-and-reinsert sync may hold duplicate (feedId, externalEventId)
-- rows. Keep the most recently updated row per pair (tie-break on id).
DELETE FROM "CalendarEvent" a
USING "CalendarEvent" b
WHERE a."feedId" = b."feedId"
  AND a."externalEventId" = b."externalEventId"
  AND a."externalEventId" IS NOT NULL
  AND (a."updatedAt" < b."updatedAt"
       OR (a."updatedAt" = b."updatedAt" AND a."id" < b."id"));

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_feedId_externalEventId_key" ON "CalendarEvent"("feedId", "externalEventId");

-- AddForeignKey
ALTER TABLE "CalendarEventChange" ADD CONSTRAINT "CalendarEventChange_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "CalendarFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
