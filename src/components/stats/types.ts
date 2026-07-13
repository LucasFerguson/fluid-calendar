export interface StatsResponse {
  timeZone: string;
  totals: {
    events: number;
    cancelled: number;
    auditEntries: number;
    oldest: string | null;
    newest: string | null;
  };
  perYear: Array<{ year: number; count: number }>;
  perCalendar: Array<{
    id: string;
    name: string;
    color: string | null;
    count: number;
  }>;
  heatmap: number[][]; // [dow 0..6][hour 0..23]
}

export interface LiveFeed {
  id: string;
  name: string;
  color: string | null;
  enabled: boolean;
  lastSync: string | null;
  backfillComplete: boolean;
  backfillCursor: string | null;
  backfillError: string | null;
  eventCount: number;
}

export interface LiveActivity {
  id: string;
  changeType: "CREATE" | "UPDATE" | "CANCELLED";
  source: "BACKFILL" | "INCREMENTAL" | "MANUAL";
  timestamp: string;
  calendarName: string;
  calendarColor: string | null;
}

export interface FeedSyncProgress {
  feedId: string;
  feedName: string;
  phase: "idle" | "backfill" | "incremental" | "horizon";
  page: number;
  eventsThisRun: number;
  startedAt: number | null;
  updatedAt: number;
}

export interface SyncProgress {
  feeds: FeedSyncProgress[];
  nextTickAt: number | null;
  lastTickAt: number | null;
}

export interface LiveResponse {
  now: string;
  progress: SyncProgress;
  feeds: LiveFeed[];
  recentActivity: LiveActivity[];
}
