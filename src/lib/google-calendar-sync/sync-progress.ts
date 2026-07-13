// In-memory, process-local snapshot of what the sync engine is doing right
// now. The scheduler runs in the same Node process as the API routes (started
// from instrumentation.ts), so the Statistics page can read this live via
// /api/stats/live without any DB writes on the hot path.
//
// This is intentionally ephemeral: it reflects the current run only and resets
// on restart. Durable history lives in CalendarEventChange and the NDJSON log.

export type SyncPhase =
  | "idle"
  | "backfill"
  | "incremental"
  | "horizon";

export interface FeedProgress {
  feedName: string;
  phase: SyncPhase;
  page: number; // current page number of the active listing (API calls made)
  eventsThisRun: number;
  startedAt: number | null; // epoch ms the current non-idle run began
  updatedAt: number; // epoch ms
}

const GLOBAL_KEY = Symbol.for("fluid-calendar.google-sync-progress");

interface ProgressState {
  feeds: Map<string, FeedProgress>;
  nextTickAt: number | null; // epoch ms of the next scheduled scheduler tick
  lastTickAt: number | null;
}

function state(): ProgressState {
  const g = globalThis as unknown as Record<symbol, ProgressState>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { feeds: new Map(), nextTickAt: null, lastTickAt: null };
  }
  return g[GLOBAL_KEY];
}

export function reportProgress(
  feedId: string,
  p: {
    feedName: string;
    phase: SyncPhase;
    page?: number;
    eventsThisRun?: number;
  }
): void {
  const prev = state().feeds.get(feedId);
  // Keep the run's start time across pages; stamp it when a run begins
  // (idle/unknown -> active), clear it when the feed goes idle.
  const startedAt =
    p.phase === "idle"
      ? null
      : prev && prev.phase !== "idle" && prev.startedAt
        ? prev.startedAt
        : Date.now();

  state().feeds.set(feedId, {
    feedName: p.feedName,
    phase: p.phase,
    page: p.page ?? 0,
    eventsThisRun: p.eventsThisRun ?? 0,
    startedAt,
    updatedAt: Date.now(),
  });
}

export function setTickTiming(lastTickAt: number, nextTickAt: number): void {
  const s = state();
  s.lastTickAt = lastTickAt;
  s.nextTickAt = nextTickAt;
}

export function getSyncProgress(): {
  feeds: Array<{ feedId: string } & FeedProgress>;
  nextTickAt: number | null;
  lastTickAt: number | null;
} {
  const s = state();
  return {
    feeds: Array.from(s.feeds.entries()).map(([feedId, p]) => ({
      feedId,
      ...p,
    })),
    nextTickAt: s.nextTickAt,
    lastTickAt: s.lastTickAt,
  };
}
