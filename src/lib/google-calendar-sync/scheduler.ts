import { prisma } from "@/lib/prisma";

import { runBackfill } from "./backfill";
import { horizonRefreshDue, runHorizonRefresh } from "./horizon";
import { runIncremental } from "./incremental";
import { reportProgress, setTickTiming } from "./sync-progress";
import { syncLog } from "./sync-logger";

// Background scheduler for the Google Calendar archival sync. Started once
// per server process from src/instrumentation.ts - no queue, no separate
// worker, no user interaction required. Each tick walks every enabled Google
// feed: feeds that haven't finished their full-history backfill get (or
// resume) a backfill run; completed feeds get a cheap incremental delta pass.
//
// Pacing between Google API calls is enforced globally by rate-limiter.ts, so
// a tick is allowed to do a lot of work (e.g. a first backfill) without
// risking quota; ticks that find nothing changed cost one API request per
// feed.

const TICK_INTERVAL_MS =
  Number(process.env.GCAL_SYNC_TICK_INTERVAL_MS) || 5 * 60 * 1000;
const FIRST_TICK_DELAY_MS =
  Number(process.env.GCAL_SYNC_FIRST_TICK_DELAY_MS) || 15 * 1000;
// Some Google-managed calendars (e.g. en.usa#holiday) reject every sync token
// with 410, no matter how it was produced. Without a cooldown those feeds
// would thrash: full re-list -> 410 -> full re-list on every tick pair. After
// a 410 reset the feed waits this long before its next full refresh, turning
// token-less calendars into a periodic-full-refresh mode.
const RESYNC_COOLDOWN_MS =
  Number(process.env.GCAL_410_RESYNC_COOLDOWN_MS) || 60 * 60 * 1000;

// Survives hot reloads in `next dev`, which re-evaluate modules.
const GLOBAL_KEY = Symbol.for("fluid-calendar.google-sync-scheduler");

type SchedulerState = {
  started: boolean;
  ticking: boolean;
  /** feedId -> epoch-ms before which a post-410 full resync must not run */
  resyncAfter: Map<string, number>;
};

function getState(): SchedulerState {
  const g = globalThis as unknown as Record<symbol, SchedulerState>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { started: false, ticking: false, resyncAfter: new Map() };
  }
  return g[GLOBAL_KEY];
}

async function tick(): Promise<void> {
  const state = getState();
  if (state.ticking) return; // never overlap ticks
  state.ticking = true;

  try {
    const feeds = await prisma.calendarFeed.findMany({
      where: {
        type: "GOOGLE",
        enabled: true,
        accountId: { not: null },
        userId: { not: null },
        url: { not: null },
      },
    });

    for (const feed of feeds) {
      try {
        if (!feed.backfillComplete) {
          if (Date.now() < (state.resyncAfter.get(feed.id) ?? 0)) {
            continue; // post-410 cooldown; skip this tick
          }
          await runBackfill(feed);
        } else if (feed.syncToken) {
          const result = await runIncremental(feed);
          if (result.resetToFull) {
            state.resyncAfter.set(feed.id, Date.now() + RESYNC_COOLDOWN_MS);
          } else if (horizonRefreshDue(feed)) {
            // Roll the forward window so open-ended series keep materializing.
            await runHorizonRefresh(feed);
          }
        } else {
          // Completed but token missing (shouldn't happen): redo backfill.
          await prisma.calendarFeed.update({
            where: { id: feed.id },
            data: { backfillComplete: false },
          });
        }
      } catch (error) {
        // Logged by backfill/incremental; keep going with the other feeds.
        void error;
      } finally {
        reportProgress(feed.id, { feedName: feed.name, phase: "idle" });
      }
    }
  } catch (error) {
    await syncLog("error", "tick_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    state.ticking = false;
    setTickTiming(Date.now(), Date.now() + TICK_INTERVAL_MS);
  }
}

export function startGoogleCalendarSyncScheduler(): void {
  const state = getState();
  if (state.started) return;
  state.started = true;

  void syncLog("info", "scheduler_started", {
    tickIntervalMs: TICK_INTERVAL_MS,
  });

  setTickTiming(Date.now(), Date.now() + FIRST_TICK_DELAY_MS);
  setTimeout(() => void tick(), FIRST_TICK_DELAY_MS);
  setInterval(() => void tick(), TICK_INTERVAL_MS);
}

/** Run one sync pass for a single feed immediately (manual sync button). */
export async function syncFeedNow(feedId: string, userId: string) {
  const feed = await prisma.calendarFeed.findUnique({
    where: { id: feedId, userId },
  });
  if (!feed || feed.type !== "GOOGLE") {
    throw new Error("Feed not found");
  }
  if (!feed.backfillComplete) {
    return { mode: "backfill" as const, result: await runBackfill(feed) };
  }
  if (!feed.syncToken) {
    return { mode: "backfill" as const, result: await runBackfill(feed) };
  }
  return { mode: "incremental" as const, result: await runIncremental(feed) };
}
