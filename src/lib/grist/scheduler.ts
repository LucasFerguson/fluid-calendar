import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { setGristTickTiming } from "./activity";
import { getGristConfig } from "./config";
import { runGristSyncTracked } from "./sync";

const LOG_SOURCE = "GristScheduler";

// Background scheduler for the Grist CRM pull, mirroring the Google Calendar
// sync scheduler: started once per server process from instrumentation.ts, no
// queue or separate worker. Each tick pulls the CRM into every user's contact
// profile overlay. Grist data (a LinkedIn/CRM export) changes slowly, so the
// default cadence is generous.

const TICK_INTERVAL_MS =
  Number(process.env.GRIST_SYNC_TICK_INTERVAL_MS) || 30 * 60 * 1000;
const FIRST_TICK_DELAY_MS =
  Number(process.env.GRIST_SYNC_FIRST_TICK_DELAY_MS) || 30 * 1000;

const GLOBAL_KEY = Symbol.for("fluid-calendar.grist-scheduler");

type SchedulerState = { started: boolean; ticking: boolean };

function getState(): SchedulerState {
  const g = globalThis as unknown as Record<symbol, SchedulerState>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = { started: false, ticking: false };
  return g[GLOBAL_KEY];
}

async function tick(): Promise<void> {
  const state = getState();
  if (state.ticking) return;

  const config = getGristConfig();
  if (!config) {
    // Not configured on this deployment; keep the countdown honest anyway.
    setGristTickTiming(Date.now(), Date.now() + TICK_INTERVAL_MS);
    return;
  }

  state.ticking = true;
  try {
    const users = await prisma.user.findMany({ select: { id: true } });
    for (const user of users) {
      try {
        await runGristSyncTracked(config, user.id, "scheduled");
      } catch (error) {
        logger.error(
          "Scheduled Grist sync failed",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
      }
    }
  } finally {
    state.ticking = false;
    setGristTickTiming(Date.now(), Date.now() + TICK_INTERVAL_MS);
  }
}

export function startGristSyncScheduler(): void {
  const state = getState();
  if (state.started) return;
  state.started = true;

  logger.info(
    "Grist scheduler started",
    { tickIntervalMs: TICK_INTERVAL_MS, configured: !!getGristConfig() },
    LOG_SOURCE
  );

  setGristTickTiming(Date.now(), Date.now() + FIRST_TICK_DELAY_MS);
  setTimeout(() => void tick(), FIRST_TICK_DELAY_MS);
  setInterval(() => void tick(), TICK_INTERVAL_MS);
}
