import { GaxiosError } from "gaxios";

import { syncLog } from "./sync-logger";

// Conservative pacing + retry for Google Calendar API calls.
//
// Google's default per-user quota is roughly 500 requests / 100 seconds.
// The defaults here (one request per GCAL_API_MIN_INTERVAL_MS, ~4/s) stay far
// below that; tune via env if your Google Cloud project has different quotas.

const MIN_INTERVAL_MS = Number(process.env.GCAL_API_MIN_INTERVAL_MS) || 250;
const MAX_RETRIES = Number(process.env.GCAL_API_MAX_RETRIES) || 5;
const BASE_BACKOFF_MS = 1000;

let lastCallAt = 0;
let queue: Promise<unknown> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getStatusCode(error: unknown): number | undefined {
  if (error instanceof GaxiosError) {
    return Number(error.response?.status ?? error.code) || undefined;
  }
  return undefined;
}

export function isSyncTokenGone(error: unknown): boolean {
  return getStatusCode(error) === 410;
}

function isRetryable(status: number | undefined): boolean {
  return status === 403 || status === 429 || (status !== undefined && status >= 500);
}

function retryAfterMs(error: unknown): number | undefined {
  if (error instanceof GaxiosError) {
    const header = error.response?.headers?.["retry-after"];
    const seconds = Number(header);
    if (!Number.isNaN(seconds) && seconds > 0) return seconds * 1000;
  }
  return undefined;
}

/**
 * Run one Google API call, globally paced (min interval between calls across
 * the whole process) and retried with exponential backoff + jitter on
 * 403/429/5xx. 410 (expired sync token) is NOT retried; callers handle it.
 */
export function pacedCall<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastCallAt = Date.now();

      try {
        return await fn();
      } catch (error) {
        const status = getStatusCode(error);
        if (attempt >= MAX_RETRIES || !isRetryable(status)) {
          throw error;
        }
        const backoff =
          retryAfterMs(error) ??
          BASE_BACKOFF_MS * 2 ** attempt + Math.random() * 1000;
        await syncLog("warn", "api_retry", {
          label,
          status,
          attempt: attempt + 1,
          backoffMs: Math.round(backoff),
        });
        await sleep(backoff);
      }
    }
  };

  // Serialize all Google API calls through one chain so pacing holds even
  // when multiple feeds sync in the same tick.
  const result = queue.then(run);
  queue = result.catch(() => undefined);
  return result;
}
