"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";

import { GristWorker } from "./types";

// Count-up "N ago" from an epoch-ms timestamp, ticking against a live clock.
function ago(from: number, now: number): string {
  const secs = Math.max(0, Math.floor((now - from) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Count-down "in N" to an epoch-ms target.
function until(target: number, now: number): string {
  const secs = Math.max(0, Math.round((target - now) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  if (mins < 60) return rem ? `${mins}m ${rem}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function GristSyncPanel({ data }: { data: GristWorker | undefined }) {
  // Local ticking clock so timers advance every second between server polls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!data) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Loading worker status…
      </div>
    );
  }

  if (!data.configured) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Grist is not configured on this deployment. Set the <code>GRIST_*</code>{" "}
        variables in <code>.env</code> to enable the CRM sync worker.
      </div>
    );
  }

  const last = data.lastSummary;

  return (
    <div className="space-y-4">
      {/* Worker status line: running / countdown to next tick / last run. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        {data.running ? (
          <span className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="font-medium">Syncing now…</span>
          </span>
        ) : (
          <span className="text-muted-foreground">
            Worker idle
            {data.lastRunAt != null && (
              <>
                {" · "}last run{" "}
                <span className="tabular-nums">{ago(data.lastRunAt, now)}</span>
              </>
            )}
          </span>
        )}
        {data.nextTickAt != null && !data.running && (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            next sync in {until(data.nextTickAt, now)}
          </span>
        )}
      </div>

      {/* Last-run summary counters. */}
      {last && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="contacts synced" value={last.synced.toLocaleString()} />
          <Stat
            label="photos pulled"
            value={last.photosDownloaded.toLocaleString()}
          />
          <Stat
            label="skipped (no email)"
            value={last.skippedNoEmail.toLocaleString()}
          />
          <Stat label="errors" value={last.errors.toLocaleString()} />
        </div>
      )}

      {/* Activity feed of recent sync runs. */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
          </span>
          Sync runs
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
          {data.recent.map((r) => (
            <div
              key={r.at}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Badge
                  variant={r.ok ? "outline" : "destructive"}
                  className="shrink-0 font-normal"
                >
                  {r.trigger}
                </Badge>
                <span className="truncate text-muted-foreground">
                  {r.synced.toLocaleString()} synced · {r.photosDownloaded} photos
                  {r.errors > 0 ? ` · ${r.errors} errors` : ""} ·{" "}
                  {(r.durationMs / 1000).toFixed(1)}s
                </span>
              </div>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {ago(r.at, now)}
              </span>
            </div>
          ))}
          {data.recent.length === 0 && (
            <div className="py-4 text-sm text-muted-foreground">
              No sync runs yet this session. The worker runs on a schedule and
              on the Settings → Accounts &quot;Sync now&quot; button.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
