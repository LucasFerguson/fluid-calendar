"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { HiOutlineStatusOnline, HiOutlineExclamation, HiX } from "react-icons/hi";

import { Badge } from "@/components/ui/badge";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { SystemPulse } from "./SystemPulse";

import { useElapsedSeconds } from "@/hooks/use-elapsed-seconds";

import { cn } from "@/lib/utils";

import { ActivityRequest, useActivityStore } from "@/store/activity";

// Keep the busy state visible for a beat after the last request finishes so
// sub-200ms requests don't flash the indicator on and off.
const LINGER_MS = 300;

function RequestRow({ request }: { request: ActivityRequest }) {
  const elapsed = useElapsedSeconds(request.startedAt);
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-xs">
      <div className="flex min-w-0 items-center gap-2">
        <Badge
          variant="secondary"
          className="shrink-0 font-mono text-[10px] font-normal uppercase"
        >
          {request.method}
        </Badge>
        <span className="truncate font-mono text-muted-foreground">
          {request.path}
        </span>
      </div>
      <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
        {elapsed}s
      </span>
    </div>
  );
}

export function ActivityIndicator() {
  const requests = useActivityStore((s) => s.requests);
  const warnings = useActivityStore((s) => s.warnings);
  const dismissWarning = useActivityStore((s) => s.dismissWarning);

  const busy = requests.length > 0;

  // Linger: stay "busy" briefly after requests drain to avoid flicker.
  const [showBusy, setShowBusy] = useState(false);
  useEffect(() => {
    if (busy) {
      setShowBusy(true);
      return;
    }
    const timer = setTimeout(() => setShowBusy(false), LINGER_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  const { oldestStartedAt, primaryLabel } = useMemo(() => {
    if (requests.length === 0) {
      return { oldestStartedAt: null as number | null, primaryLabel: "" };
    }
    const oldest = requests.reduce((a, b) =>
      a.startedAt <= b.startedAt ? a : b
    );
    return {
      oldestStartedAt: oldest.startedAt,
      primaryLabel:
        requests.length === 1
          ? oldest.label
          : `Loading ${requests.length} requests`,
    };
  }, [requests]);

  // Remember the last active busy snapshot so the linger window keeps showing a
  // stable timer/label after `requests` has already emptied.
  const lastBusyRef = useRef<{ startedAt: number; label: string }>({
    startedAt: Date.now(),
    label: "Loading",
  });
  if (oldestStartedAt != null) {
    lastBusyRef.current = { startedAt: oldestStartedAt, label: primaryLabel };
  }

  // Most recent warning wins the prominent slot.
  const activeWarning =
    warnings.length > 0 ? warnings[warnings.length - 1] : null;

  return (
    <div className="flex items-center gap-2">
      {activeWarning && (
        <div
          role="alert"
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
            "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          )}
        >
          <HiOutlineExclamation className="h-4 w-4 shrink-0" />
          <span className="max-w-[16rem] truncate">
            {activeWarning.message}
          </span>
          <button
            type="button"
            onClick={() => dismissWarning(activeWarning.id)}
            className="ml-0.5 rounded p-0.5 hover:bg-amber-500/20"
            title="Dismiss"
          >
            <HiX className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Network activity"
          >
            {showBusy ? (
              <LoadingIndicator
                variant="inline"
                startedAt={lastBusyRef.current.startedAt}
                label={lastBusyRef.current.label}
              />
            ) : (
              <>
                <HiOutlineStatusOnline className="h-4 w-4" />
                <span className="hidden sm:inline">Idle</span>
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <div className="mb-2 text-sm font-medium">Network activity</div>
          <div className="max-h-64 divide-y divide-border overflow-y-auto">
            {requests.length > 0 ? (
              requests.map((request) => (
                <RequestRow key={request.id} request={request} />
              ))
            ) : (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No active requests.
              </div>
            )}
          </div>
          <SystemPulse />
        </PopoverContent>
      </Popover>
    </div>
  );
}
