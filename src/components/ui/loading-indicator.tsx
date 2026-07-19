"use client";

import { useMemo } from "react";

import { AnimatedNumber } from "@/components/stats/AnimatedNumber";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

import { useElapsedSeconds } from "@/hooks/use-elapsed-seconds";

import { cn } from "@/lib/utils";

// Optional stat shown alongside the timer, e.g. { label: "events", value: 142 }.
// Numeric values roll up via AnimatedNumber unless `animate` is false.
export interface LoadingStat {
  label: string;
  value: number | string;
  animate?: boolean;
}

export interface LoadingIndicatorProps {
  // Epoch ms when loading began. The elapsed timer counts up from here.
  // Defaults to mount time, so a bare <LoadingIndicator /> just works.
  startedAt?: number;
  // Primary label, e.g. "Loading events". A trailing "… {n}s" is appended.
  label?: string;
  // Optional stat slots shown after the timer.
  stats?: LoadingStat[];
  size?: "sm" | "default" | "lg";
  // "inline" for nav/badge contexts, "block" for a centered panel placeholder.
  variant?: "inline" | "block";
  className?: string;
}

function StatValue({ stat }: { stat: LoadingStat }) {
  const isAnimatableNumber =
    typeof stat.value === "number" && stat.animate !== false;
  return (
    <span className="whitespace-nowrap">
      {isAnimatableNumber ? (
        <AnimatedNumber value={stat.value as number} />
      ) : (
        stat.value
      )}{" "}
      {stat.label}
    </span>
  );
}

export function LoadingIndicator({
  startedAt,
  label,
  stats,
  size = "sm",
  variant = "inline",
  className,
}: LoadingIndicatorProps) {
  // Freeze a mount time when no explicit start is given, so the timer is
  // stable across re-renders.
  const start = useMemo(
    () => startedAt ?? Date.now(),
    [startedAt]
  );
  const elapsed = useElapsedSeconds(start);

  if (variant === "block") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 py-8 text-center text-muted-foreground",
          className
        )}
      >
        <LoadingSpinner size={size} />
        <div className="text-sm">
          {label ? <span>{label}</span> : <span>Loading</span>}
          <span className="ml-1 font-mono tabular-nums">… {elapsed}s</span>
        </div>
        {stats && stats.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
            {stats.map((stat) => (
              <StatValue key={stat.label} stat={stat} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      {/* Pulsing dot reused from the Statistics live panel. */}
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      <span className="min-w-0 truncate">
        {label ?? "Loading"}
        <span className="ml-1 font-mono tabular-nums">… {elapsed}s</span>
      </span>
      {stats && stats.length > 0 && (
        <>
          {stats.map((stat) => (
            <span key={stat.label} className="flex items-center gap-1">
              <span aria-hidden className="text-muted-foreground/50">
                ·
              </span>
              <StatValue stat={stat} />
            </span>
          ))}
        </>
      )}
    </span>
  );
}
