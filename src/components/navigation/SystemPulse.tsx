"use client";

import { useEffect, useMemo, useState } from "react";

import { AnimatedNumber } from "@/components/stats/AnimatedNumber";

import { logger } from "@/lib/logger";

const LOG_SOURCE = "SystemPulse";

// Shapes we consume from the existing stats endpoints (only the fields we use).
interface LiveData {
  progress?: { nextTickAt: number | null };
  grist?: { configured: boolean; nextTickAt: number | null };
}
interface StatsData {
  totals: {
    events: number;
    cancelled: number;
    auditEntries: number;
    oldest: string | null;
    newest: string | null;
  };
  perCalendar: unknown[];
  contacts: { people: number; crmProfiles: number };
}

function formatCountdown(target: number | null, now: number): string {
  if (target == null) return "—";
  const secs = Math.max(0, Math.round((target - now) / 1000));
  if (secs === 0) return "due now";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function Countdown({
  label,
  target,
  now,
}: {
  label: string;
  target: number | null;
  now: number;
}) {
  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums font-medium">
        {formatCountdown(target, now)}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/50 px-2 py-1.5">
      <div className="text-sm font-semibold tabular-nums">
        <AnimatedNumber value={value} />
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

// A little "system pulse" panel: live countdowns to the next calendar-sync and
// contacts/CRM-sync worker ticks, plus a few archive/contact totals. Data comes
// from the same endpoints the Statistics page uses; fetched lazily when the
// popover opens (this component only mounts while the popover is open).
export function SystemPulse() {
  const [live, setLive] = useState<LiveData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Tick once a second so the countdowns stay live.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Fetch quietly (no activity-store tracking) so opening the panel doesn't
    // show its own fetches as network activity in the same panel.
    Promise.all([
      fetch("/api/stats/live").then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/stats").then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([liveData, statsData]) => {
        if (cancelled) return;
        setLive(liveData);
        setStats(statsData);
      })
      .catch((error) => {
        if (cancelled) return;
        setFailed(true);
        logger.error(
          "Failed to load system pulse stats",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const yearsOfHistory = useMemo(() => {
    const oldest = stats?.totals.oldest;
    const newest = stats?.totals.newest;
    if (!oldest || !newest) return null;
    const ms = new Date(newest).getTime() - new Date(oldest).getTime();
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return ms / (365.25 * 24 * 60 * 60 * 1000);
  }, [stats]);

  const gristConfigured = live?.grist?.configured ?? false;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="mb-2 text-sm font-medium">System pulse</div>

      {failed ? (
        <div className="py-2 text-center text-xs text-muted-foreground">
          Couldn&apos;t load stats.
        </div>
      ) : (
        <>
          <div className="mb-2">
            <Countdown
              label="Next calendar sync"
              target={live?.progress?.nextTickAt ?? null}
              now={now}
            />
            {gristConfigured && (
              <Countdown
                label="Next contacts sync"
                target={live?.grist?.nextTickAt ?? null}
                now={now}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <Stat label="Events archived" value={stats?.totals.events ?? 0} />
            <Stat label="Contacts" value={stats?.contacts.people ?? 0} />
            <Stat label="Deletions kept" value={stats?.totals.cancelled ?? 0} />
            <Stat label="Audit entries" value={stats?.totals.auditEntries ?? 0} />
            <Stat label="Calendars" value={stats?.perCalendar.length ?? 0} />
            <Stat
              label="CRM profiles"
              value={stats?.contacts.crmProfiles ?? 0}
            />
          </div>

          {yearsOfHistory != null && (
            <div className="mt-2 text-center text-[11px] text-muted-foreground">
              {yearsOfHistory.toFixed(1)} years of history mirrored
            </div>
          )}
        </>
      )}
    </div>
  );
}
