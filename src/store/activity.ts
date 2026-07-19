import { v4 as uuidv4 } from "uuid";
import { create } from "zustand";

import { logger } from "@/lib/logger";

const LOG_SOURCE = "ActivityStore";

// How long a transient warning stays visible before it auto-dismisses.
const DEFAULT_WARNING_TTL_MS = 6000;

// A single in-flight request tracked by the global activity indicator.
export interface ActivityRequest {
  id: string;
  path: string;
  method: string;
  label: string;
  startedAt: number; // epoch ms
}

// A short-lived, user-facing warning surfaced in the nav activity indicator.
// Purpose: loading must never silently drop data (e.g. a truncated events
// fetch), so callers can raise a loud, dismissible warning.
export interface ActivityWarning {
  id: string;
  message: string;
  createdAt: number; // epoch ms
}

export interface StartActivityInput {
  path: string;
  method: string;
  label: string;
  startedAt?: number; // defaults to Date.now()
}

interface ActivityStore {
  requests: ActivityRequest[];
  warnings: ActivityWarning[];

  // Register an in-flight request; returns its id (pass to finish()).
  start: (input: StartActivityInput) => string;
  // Deregister a request by id. Idempotent.
  finish: (id: string) => void;

  // Record a transient warning. Auto-dismisses after `ttlMs` (default 6s);
  // pass ttlMs: 0 to keep it until dismissed manually. Returns its id.
  warn: (message: string, options?: { ttlMs?: number }) => string;
  // Remove a warning early. Idempotent.
  dismissWarning: (id: string) => void;
  clearWarnings: () => void;
}

export const useActivityStore = create<ActivityStore>()((set) => ({
  requests: [],
  warnings: [],

  start: (input) => {
    const id = uuidv4();
    const request: ActivityRequest = {
      id,
      path: input.path,
      method: input.method.toUpperCase(),
      label: input.label,
      startedAt: input.startedAt ?? Date.now(),
    };
    set((state) => ({ requests: [...state.requests, request] }));
    return id;
  },

  finish: (id) => {
    set((state) => ({
      requests: state.requests.filter((r) => r.id !== id),
    }));
  },

  warn: (message, options) => {
    const id = uuidv4();
    const warning: ActivityWarning = {
      id,
      message,
      createdAt: Date.now(),
    };
    set((state) => ({ warnings: [...state.warnings, warning] }));
    logger.warn(message, { warningId: id }, LOG_SOURCE);

    const ttlMs = options?.ttlMs ?? DEFAULT_WARNING_TTL_MS;
    if (ttlMs > 0 && typeof window !== "undefined") {
      window.setTimeout(() => {
        set((state) => ({
          warnings: state.warnings.filter((w) => w.id !== id),
        }));
      }, ttlMs);
    }
    return id;
  },

  dismissWarning: (id) => {
    set((state) => ({
      warnings: state.warnings.filter((w) => w.id !== id),
    }));
  },

  clearWarnings: () => set({ warnings: [] }),
}));

// --- Convenience selectors (return primitives so they never trigger the
// new-object-selector re-render pitfall). ---

// Is anything currently loading.
export const useActivityBusy = () =>
  useActivityStore((s) => s.requests.length > 0);

// Is a warning currently active.
export const useHasActiveWarning = () =>
  useActivityStore((s) => s.warnings.length > 0);
