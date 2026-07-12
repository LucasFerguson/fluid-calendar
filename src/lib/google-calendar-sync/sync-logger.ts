import { appendFile, mkdir } from "fs/promises";
import path from "path";

import { newDate } from "@/lib/date-utils";

// Disk-based operational log for the Google Calendar archival sync, separate
// from the DB Log table on purpose: old months can be pruned years from now
// by simply deleting files, with no database surgery.
//
// One NDJSON line per operational event, in logs/google-calendar-sync/YYYY-MM.ndjson.

const LOG_DIR = path.join(process.cwd(), "logs", "google-calendar-sync");

let dirReady: Promise<void> | null = null;

function ensureDir(): Promise<void> {
  if (!dirReady) {
    dirReady = mkdir(LOG_DIR, { recursive: true }).then(() => undefined);
  }
  return dirReady;
}

export type SyncLogLevel = "info" | "warn" | "error";

export async function syncLog(
  level: SyncLogLevel,
  event: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  try {
    await ensureDir();
    const now = newDate();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const line =
      JSON.stringify({
        ts: now.toISOString(),
        level,
        event,
        ...data,
      }) + "\n";
    await appendFile(path.join(LOG_DIR, `${month}.ndjson`), line, "utf8");
  } catch (error) {
    // The sync must never fail because the log disk write failed.
    console.error("google-calendar-sync: failed to write sync log", error);
  }
}
