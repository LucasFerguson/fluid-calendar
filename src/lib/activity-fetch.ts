import { logger } from "@/lib/logger";

import { useActivityStore } from "@/store/activity";

const LOG_SOURCE = "ActivityFetch";

// Opt-in helpers that report in-flight work to the global activity store so it
// appears in the nav activity indicator. These are intentionally opt-in (no
// global fetch monkey-patch) so only meaningful app requests show up in the
// monitor, not framework/internal traffic.

export interface WithActivityMeta {
  path: string;
  method: string;
  label: string;
}

// Wrap any async unit of work so it registers with the activity store for its
// duration. Use this when a logical "load" spans more than one fetch (e.g. the
// calendar store loading feeds + events together).
export async function withActivity<T>(
  meta: WithActivityMeta,
  fn: () => Promise<T>
): Promise<T> {
  const id = useActivityStore.getState().start(meta);
  try {
    return await fn();
  } catch (error) {
    logger.error(
      "Tracked activity failed",
      {
        path: meta.path,
        method: meta.method,
        label: meta.label,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    throw error;
  } finally {
    useActivityStore.getState().finish(id);
  }
}

// Drop-in fetch replacement that auto-registers/deregisters the request. Pass
// `activityLabel` for a human-friendly label (falls back to "METHOD path").
export async function trackedFetch(
  input: RequestInfo | URL,
  init?: RequestInit & { activityLabel?: string }
): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const path =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.pathname
        : input.url;
  const label = init?.activityLabel ?? `${method} ${path}`;

  return withActivity({ path, method, label }, () => fetch(input, init));
}
