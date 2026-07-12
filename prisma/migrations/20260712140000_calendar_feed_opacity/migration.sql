-- Per-calendar event background opacity (e.g. a faint always-on time-blocking
-- base layer that other events render on top of).
ALTER TABLE "CalendarFeed" ADD COLUMN "opacity" DOUBLE PRECISION DEFAULT 1;
