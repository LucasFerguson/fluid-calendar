import { CalendarFeed } from "@prisma/client";
import { calendar_v3 } from "googleapis";

import { newDate } from "@/lib/date-utils";
import { getGoogleCalendarClient } from "@/lib/google-calendar";
import { prisma } from "@/lib/prisma";

import { isSyncTokenGone, pacedCall } from "./rate-limiter";
import { reportProgress } from "./sync-progress";
import { syncLog } from "./sync-logger";
import { findMasterId, upsertGoogleEvent } from "./upsert";

const PAGE_SIZE = 2500;

export interface IncrementalResult {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  pages: number;
  /** True when Google returned 410 Gone and the feed was reset to backfill. */
  resetToFull: boolean;
}

// One incremental delta pass for a feed that has completed backfill: ask
// Google for everything changed since the stored syncToken (created, updated,
// and deleted-as-status-cancelled events), apply each through the idempotent
// upsert, and store the new token.
//
// singleEvents must match the listing that produced the token (true, from
// backfill pass B), so series edits arrive as their affected expanded
// instances. A 410 Gone means Google expired the token; the feed is flipped
// back to backfill state and the next scheduler tick performs a full resync.
export async function runIncremental(
  feed: CalendarFeed
): Promise<IncrementalResult> {
  if (!feed.accountId || !feed.userId || !feed.url || !feed.syncToken) {
    throw new Error(`Feed ${feed.id} is missing account, user, url, or token`);
  }

  const client = await getGoogleCalendarClient(feed.accountId, feed.userId);
  const calendarId = feed.url;
  const result: IncrementalResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    pages: 0,
    resetToFull: false,
  };
  const masterCache = new Map<string, string | null>();

  try {
    const syncToken = feed.syncToken;
    let nextSyncToken: string | undefined = undefined;
    let pageToken: string | undefined = undefined;

    do {
      const res: calendar_v3.Schema$Events = await pacedCall(
        "incremental.list",
        async () =>
          (
            await client.events.list({
              calendarId,
              syncToken,
              // Google requires sync-token requests to repeat the parameters
              // of the listing that produced the token (backfill pass B uses
              // singleEvents + showDeleted); omitting showDeleted makes some
              // calendars (e.g. Google-managed holiday calendars) return 410
              // for every fresh token, looping the feed back into backfill.
              singleEvents: true,
              showDeleted: true,
              maxResults: PAGE_SIZE,
              pageToken,
            })
          ).data
      );
      result.pages++;
      reportProgress(feed.id, {
        feedName: feed.name,
        phase: "incremental",
        page: result.pages,
        eventsThisRun: result.created + result.updated,
      });

      for (const event of res.items || []) {
        // A changed instance of a series we have never archived (e.g. a
        // series created since the last delta): pull its master first so the
        // RRULE and linkage are preserved.
        let masterId: string | null = null;
        if (event.recurringEventId) {
          masterId = await findMasterId(
            feed.id,
            event.recurringEventId,
            masterCache
          );
          if (masterId === null) {
            try {
              const master = await pacedCall("incremental.get.master", () =>
                client.events.get({
                  calendarId,
                  eventId: event.recurringEventId!,
                })
              );
              await upsertGoogleEvent({
                feedId: feed.id,
                event: master.data,
                source: "INCREMENTAL",
                isMaster: !!master.data.recurrence,
              });
              masterCache.delete(event.recurringEventId);
              masterId = await findMasterId(
                feed.id,
                event.recurringEventId,
                masterCache
              );
            } catch (error) {
              await syncLog("warn", "master_fetch_failed", {
                feedId: feed.id,
                recurringEventId: event.recurringEventId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }

        const outcome = await upsertGoogleEvent({
          feedId: feed.id,
          event,
          source: "INCREMENTAL",
          masterId,
        });
        if (outcome === "created") result.created++;
        else if (outcome === "updated" || outcome === "cancelled")
          result.updated++;
        else if (outcome === "unchanged") result.unchanged++;
        else result.skipped++;
      }

      pageToken = res.nextPageToken ?? undefined;
      if (res.nextSyncToken) nextSyncToken = res.nextSyncToken;
    } while (pageToken);

    await prisma.calendarFeed.update({
      where: { id: feed.id },
      data: {
        syncToken: nextSyncToken ?? syncToken,
        lastSync: newDate(),
        error: null,
      },
    });

    if (result.created || result.updated || result.pages > 1) {
      await syncLog("info", "incremental_complete", {
        feedId: feed.id,
        calendarId,
        ...result,
      });
    }
    return result;
  } catch (error) {
    if (isSyncTokenGone(error)) {
      // Token expired on Google's side: fall back to a fresh full resync.
      await prisma.calendarFeed.update({
        where: { id: feed.id },
        data: { syncToken: null, backfillComplete: false },
      });
      await syncLog("warn", "sync_token_expired", {
        feedId: feed.id,
        calendarId,
      });
      result.resetToFull = true;
      return result;
    }

    const message = error instanceof Error ? error.message : String(error);
    await prisma.calendarFeed.update({
      where: { id: feed.id },
      data: { error: message },
    });
    await syncLog("error", "incremental_failed", {
      feedId: feed.id,
      calendarId,
      error: message,
    });
    throw error;
  }
}
