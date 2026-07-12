import { CalendarFeed } from "@prisma/client";
import { calendar_v3 } from "googleapis";

import { newDate } from "@/lib/date-utils";
import { getGoogleCalendarClient } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";

import { pacedCall } from "./rate-limiter";
import { syncLog } from "./sync-logger";
import { findMasterId, upsertGoogleEvent } from "./upsert";

const PAGE_SIZE = 2500; // Google maximum; fewer requests per pass

export interface BackfillResult {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  pages: number;
}

// Full-history backfill for one Google feed. Two unbounded, paginated,
// throttled passes over the calendar:
//
//   Pass A (singleEvents: false): recurring masters with their RRULEs, plus
//     standalone events. Preserves series fidelity that per-instance
//     expansion alone would lose.
//   Pass B (singleEvents: true): every expanded instance across all history,
//     linked to its master row. The nextSyncToken from this pass's final page
//     hands the feed over to cheap incremental syncs.
//
// The listing is deliberately NOT time-bounded: Google scopes a sync token to
// the filters of the listing that produced it, and an archival mirror needs an
// unbounded token. Interruptions are safe - every write is an idempotent
// upsert, so a re-run converges instead of duplicating. showDeleted captures
// events cancelled-but-retained on Google's side.
export async function runBackfill(feed: CalendarFeed): Promise<BackfillResult> {
  if (!feed.accountId || !feed.userId || !feed.url) {
    throw new Error(`Feed ${feed.id} is missing account, user, or url`);
  }

  const client = await getGoogleCalendarClient(feed.accountId, feed.userId);
  const calendarId = feed.url;
  const result: BackfillResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    pages: 0,
  };
  let oldestStart: Date | null = null;
  const masterCache = new Map<string, string | null>();

  await syncLog("info", "backfill_start", { feedId: feed.id, calendarId });

  const tally = (outcome: string) => {
    if (outcome === "created") result.created++;
    else if (outcome === "updated" || outcome === "cancelled") result.updated++;
    else if (outcome === "unchanged") result.unchanged++;
    else result.skipped++;
  };

  const trackOldest = (event: calendar_v3.Schema$Event) => {
    const startStr = event.start?.dateTime || event.start?.date;
    if (!startStr) return;
    const start = newDate(startStr);
    if (!oldestStart || start < oldestStart) oldestStart = start;
  };

  try {
    // Pass A: masters + standalone events (unexpanded).
    let pageToken: string | undefined = undefined;
    do {
      const res: calendar_v3.Schema$Events = await pacedCall(
        "backfill.list.masters",
        async () =>
          (
            await client.events.list({
              calendarId,
              singleEvents: false,
              showDeleted: true,
              maxResults: PAGE_SIZE,
              pageToken,
            })
          ).data
      );
      result.pages++;

      for (const event of res.items || []) {
        // Recurrence exceptions surface here too; they are handled in the
        // expanded pass where their master row is guaranteed to exist.
        if (event.recurringEventId) continue;
        trackOldest(event);
        tally(
          await upsertGoogleEvent({
            feedId: feed.id,
            event,
            source: "BACKFILL",
            isMaster: !!event.recurrence,
          })
        );
      }
      pageToken = res.nextPageToken ?? undefined;
    } while (pageToken);

    // Pass B: every expanded instance, plus the archive-wide sync token.
    let syncToken: string | undefined = undefined;
    pageToken = undefined;
    do {
      const res: calendar_v3.Schema$Events = await pacedCall(
        "backfill.list.instances",
        async () =>
          (
            await client.events.list({
              calendarId,
              singleEvents: true,
              showDeleted: true,
              maxResults: PAGE_SIZE,
              pageToken,
            })
          ).data
      );
      result.pages++;

      for (const event of res.items || []) {
        trackOldest(event);
        const masterId = event.recurringEventId
          ? await findMasterId(feed.id, event.recurringEventId, masterCache)
          : null;
        tally(
          await upsertGoogleEvent({
            feedId: feed.id,
            event,
            source: "BACKFILL",
            masterId,
          })
        );
      }

      // Progress is persisted per page so a restart shows how far we got,
      // even though correctness never depends on it.
      await prisma.calendarFeed.update({
        where: { id: feed.id },
        data: { backfillCursor: oldestStart ?? undefined },
      });

      pageToken = res.nextPageToken ?? undefined;
      if (res.nextSyncToken) syncToken = res.nextSyncToken;
    } while (pageToken);

    await prisma.calendarFeed.update({
      where: { id: feed.id },
      data: {
        syncToken: syncToken ?? null,
        backfillComplete: true,
        backfillError: null,
        lastSync: newDate(),
        error: null,
      },
    });

    await syncLog("info", "backfill_complete", {
      feedId: feed.id,
      calendarId,
      ...result,
      oldestStart: oldestStart
        ? (oldestStart as Date).toISOString()
        : null,
      hasSyncToken: !!syncToken,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.calendarFeed.update({
      where: { id: feed.id },
      data: { backfillError: message },
    });
    await syncLog("error", "backfill_failed", {
      feedId: feed.id,
      calendarId,
      error: message,
      ...result,
    });
    throw error;
  }
}
