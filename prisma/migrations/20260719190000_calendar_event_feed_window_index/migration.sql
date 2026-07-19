-- Backs the windowed calendar fetch (GET /api/calendar/events): a feed-scoped
-- range scan for the start <= rangeEnd AND end >= rangeStart overlap window,
-- replacing the previous full-archive over-fetch.
CREATE INDEX "CalendarEvent_feedId_start_end_idx" ON "CalendarEvent"("feedId", "start", "end");
