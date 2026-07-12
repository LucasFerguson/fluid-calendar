import { CalendarFeed } from "@prisma/client";
import { calendar_v3 } from "googleapis";

import { newDate } from "@/lib/date-utils";
import { getGoogleCalendarClient } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";

import { pacedCall } from "./rate-limiter";
import { reportProgress } from "./sync-progress";
import { syncLog } from "./sync-logger";
import { findMasterId, upsertGoogleEvent } from "./upsert";

const PAGE_SIZE = 2500;

// How far ahead to keep occurrences materialized, and how often to roll the
// window forward. Google only expands open-ended recurring series ~2 years
// ahead; incremental sync tokens do not surface occurrences that only later
// come into that horizon. This forward-windowed re-list closes that gap.
const HORIZON_DAYS = Number(process.env.GCAL_HORIZON_DAYS) || 730;
const HORIZON_REFRESH_INTERVAL_MS =
  Number(process.env.GCAL_HORIZON_REFRESH_INTERVAL_MS) || 24 * 3600 * 1000;

export function horizonRefreshDue(feed: CalendarFeed): boolean {
  if (!feed.backfillComplete) return false;
  if (!feed.lastHorizonRefresh) return true;
  return (
    Date.now() - feed.lastHorizonRefresh.getTime() >= HORIZON_REFRESH_INTERVAL_MS
  );
}

// Re-list the forward window [now, now + HORIZON_DAYS] with singleEvents so any
// occurrences of open-ended series that have rolled into the horizon get
// materialized. Idempotent upserts — most rows come back "unchanged".
export async function runHorizonRefresh(feed: CalendarFeed): Promise<void> {
  if (!feed.accountId || !feed.userId || !feed.url) return;

  const client = await getGoogleCalendarClient(feed.accountId, feed.userId);
  const calendarId = feed.url;
  const masterCache = new Map<string, string | null>();
  const now = newDate();
  const timeMax = newDate(now.getTime() + HORIZON_DAYS * 24 * 3600 * 1000);

  let created = 0;
  let pages = 0;
  let pageToken: string | undefined = undefined;

  try {
    reportProgress(feed.id, {
      feedName: feed.name,
      phase: "horizon",
      page: 0,
      eventsThisRun: 0,
    });

    do {
      const res: calendar_v3.Schema$Events = await pacedCall(
        "horizon.list",
        async () =>
          (
            await client.events.list({
              calendarId,
              singleEvents: true,
              showDeleted: true,
              timeMin: now.toISOString(),
              timeMax: timeMax.toISOString(),
              maxResults: PAGE_SIZE,
              pageToken,
            })
          ).data
      );
      pages++;

      for (const event of res.items || []) {
        const masterId = event.recurringEventId
          ? await findMasterId(feed.id, event.recurringEventId, masterCache)
          : null;
        const outcome = await upsertGoogleEvent({
          feedId: feed.id,
          event,
          source: "BACKFILL",
          masterId,
        });
        if (outcome === "created") created++;
      }
      reportProgress(feed.id, {
        feedName: feed.name,
        phase: "horizon",
        page: pages,
        eventsThisRun: created,
      });
      pageToken = res.nextPageToken ?? undefined;
    } while (pageToken);

    await prisma.calendarFeed.update({
      where: { id: feed.id },
      data: { lastHorizonRefresh: now },
    });

    if (created > 0) {
      await syncLog("info", "horizon_refresh", {
        feedId: feed.id,
        calendarId,
        created,
        pages,
        horizonDays: HORIZON_DAYS,
      });
    }
  } catch (error) {
    await syncLog("error", "horizon_refresh_failed", {
      feedId: feed.id,
      calendarId,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    reportProgress(feed.id, { feedName: feed.name, phase: "idle" });
  }
}
