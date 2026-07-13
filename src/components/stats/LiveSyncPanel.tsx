"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";

import { LiveActivity, LiveFeed, LiveResponse } from "./types";

function relativeTime(from: string, now: number): string {
  const secs = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const CHANGE_STYLE: Record<
  LiveActivity["changeType"],
  { label: string; className: string }
> = {
  CREATE: {
    label: "created",
    className: "text-emerald-600 dark:text-emerald-400",
  },
  UPDATE: { label: "updated", className: "text-blue-600 dark:text-blue-400" },
  CANCELLED: { label: "deleted", className: "text-red-600 dark:text-red-400" },
};

function FeedRow({ feed, now }: { feed: LiveFeed; now: number }) {
  let status: { label: string; variant: "secondary" | "destructive" | "outline" };
  if (feed.backfillError) {
    status = { label: "error", variant: "destructive" };
  } else if (!feed.backfillComplete) {
    status = {
      label: feed.backfillCursor ? "backfilling…" : "queued",
      variant: "secondary",
    };
  } else if (feed.lastSync) {
    status = { label: `synced ${relativeTime(feed.lastSync, now)}`, variant: "outline" };
  } else {
    status = { label: "idle", variant: "outline" };
  }

  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: feed.color || "rgb(var(--viz-accent))" }}
        />
        <span className="truncate">{feed.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {feed.eventCount.toLocaleString()} events
        </span>
      </div>
      <Badge
        variant={status.variant}
        className="shrink-0 font-mono text-xs font-normal tabular-nums"
      >
        {status.label}
      </Badge>
    </div>
  );
}

export function LiveSyncPanel({ data }: { data: LiveResponse | undefined }) {
  // Local ticking clock so the relative times advance every second even
  // between server polls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!data) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Loading sync status…
      </div>
    );
  }

  const active = data.progress?.feeds.filter((f) => f.phase !== "idle") ?? [];
  const nextTickAt = data.progress?.nextTickAt ?? null;
  const secsToTick =
    nextTickAt != null ? Math.max(0, Math.round((nextTickAt - now) / 1000)) : null;

  const PHASE_LABEL: Record<string, string> = {
    backfill: "Full backfill",
    incremental: "Incremental sync",
    horizon: "Horizon refresh",
  };

  return (
    <div className="space-y-4">
      {/* Live engine status: what the sync is doing right now + next tick. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        {active.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {active.map((f) => (
              <span key={f.feedId} className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                </span>
                <span className="font-medium">{PHASE_LABEL[f.phase]}</span>
                <span className="text-muted-foreground">
                  {f.feedName} · page {f.page}
                  {f.eventsThisRun > 0
                    ? ` · +${f.eventsThisRun.toLocaleString()} new`
                    : ""}
                  {f.startedAt
                    ? ` · running ${Math.max(0, Math.round((now - f.startedAt) / 1000))}s`
                    : ""}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">Sync engine idle</span>
        )}
        {secsToTick != null && active.length === 0 && (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            next check in {secsToTick}s
          </span>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
      <div>
        <div className="mb-2 text-sm font-medium">Calendars</div>
        <div className="divide-y divide-border">
          {data.feeds.map((feed) => (
            <FeedRow key={feed.id} feed={feed} now={now} />
          ))}
          {data.feeds.length === 0 && (
            <div className="py-4 text-sm text-muted-foreground">
              No Google calendars connected.
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live activity
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
          {data.recentActivity.map((a) => {
            const style = CHANGE_STYLE[a.changeType];
            return (
              <div
                key={a.id}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        a.calendarColor || "rgb(var(--viz-accent))",
                    }}
                  />
                  <span className={"font-medium " + style.className}>
                    {style.label}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {a.calendarName}
                  </span>
                </div>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {relativeTime(a.timestamp, now)}
                </span>
              </div>
            );
          })}
          {data.recentActivity.length === 0 && (
            <div className="py-4 text-sm text-muted-foreground">
              No sync activity recorded yet.
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
