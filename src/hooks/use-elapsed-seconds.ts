"use client";

import { useEffect, useState } from "react";

// Returns whole seconds elapsed since `startedAt` (epoch ms), ticking once per
// second on the client with no external data required. Pass null to pause
// (returns 0). Generalizes the live ticker used by the Statistics page
// (see src/components/stats/LiveSyncPanel.tsx) so the loading UI and stats
// share one timer implementation.
export function useElapsedSeconds(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt == null) {
      return;
    }
    // Re-sync immediately so a fresh start doesn't wait a tick to show "0s".
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  if (startedAt == null) {
    return 0;
  }
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}
