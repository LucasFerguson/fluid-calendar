// In-memory, process-local record of the Grist CRM sync worker's activity, so
// the Statistics page can show a live feed + countdowns without DB writes on
// the hot path. Ephemeral by design (resets on restart); the durable last-run
// summary still lives in data/grist-sync-status.json.

export interface GristRun {
  at: number; // epoch ms the run finished
  ok: boolean;
  synced: number;
  photosDownloaded: number;
  skippedNoEmail: number;
  errors: number;
  durationMs: number;
  trigger: "scheduled" | "manual";
}

interface GristActivityState {
  running: boolean;
  lastRunAt: number | null;
  lastTickAt: number | null;
  nextTickAt: number | null;
  runs: GristRun[]; // newest first, capped
}

const CAP = 25;
const GLOBAL_KEY = Symbol.for("fluid-calendar.grist-activity");

function state(): GristActivityState {
  const g = globalThis as unknown as Record<symbol, GristActivityState>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      running: false,
      lastRunAt: null,
      lastTickAt: null,
      nextTickAt: null,
      runs: [],
    };
  }
  return g[GLOBAL_KEY];
}

export function setGristRunning(running: boolean): void {
  state().running = running;
}

export function recordGristRun(run: GristRun): void {
  const s = state();
  s.lastRunAt = run.at;
  s.runs = [run, ...s.runs].slice(0, CAP);
}

export function setGristTickTiming(
  lastTickAt: number | null,
  nextTickAt: number | null
): void {
  const s = state();
  s.lastTickAt = lastTickAt;
  s.nextTickAt = nextTickAt;
}

export function getGristActivity(): GristActivityState {
  const s = state();
  return { ...s, runs: [...s.runs] };
}
