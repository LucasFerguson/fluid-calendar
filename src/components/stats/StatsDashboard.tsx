"use client";

import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { AnimatedNumber } from "./AnimatedNumber";
import { CalendarBreakdown } from "./CalendarBreakdown";
import { GristSyncPanel } from "./GristSyncPanel";
import { HourWeekHeatmap } from "./HourWeekHeatmap";
import { LiveSyncPanel } from "./LiveSyncPanel";
import { StatTile } from "./StatTile";
import { LiveResponse, StatsResponse } from "./types";
import { YearBarChart } from "./YearBarChart";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function yearsOfHistory(oldest: string | null, newest: string | null): string {
  if (!oldest || !newest) return "—";
  const years =
    (new Date(newest).getTime() - new Date(oldest).getTime()) /
    (365.25 * 24 * 3600 * 1000);
  if (years < 1) return "< 1 yr";
  return `${Math.round(years)} yrs`;
}

export function StatsDashboard() {
  const stats = useQuery<StatsResponse>({
    queryKey: ["stats"],
    queryFn: () => fetchJson<StatsResponse>("/api/stats"),
    // Refresh periodically so the counters climb as the archive grows; the
    // AnimatedNumber tiles tween to each new value. Pauses when tab unfocused.
    refetchInterval: 15000,
  });

  // Live panel polls every 5s. TanStack Query pauses refetchInterval while the
  // tab is unfocused (refetchIntervalInBackground defaults to false), so this
  // only syncs while someone is actually looking at the dashboard.
  const live = useQuery<LiveResponse>({
    queryKey: ["stats-live"],
    queryFn: () => fetchJson<LiveResponse>("/api/stats/live"),
    refetchInterval: 5000,
    staleTime: 0,
  });

  const totals = stats.data?.totals;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Statistics</h1>
        <p className="text-sm text-muted-foreground">
          Your sovereign calendar archive
          {stats.data ? ` · times shown in ${stats.data.timeZone}` : ""}
        </p>
      </div>

      {/* Hero tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Events archived"
          value={<AnimatedNumber value={totals?.events ?? 0} />}
          accent
        />
        <StatTile
          label="History"
          value={yearsOfHistory(totals?.oldest ?? null, totals?.newest ?? null)}
          sublabel={
            totals?.oldest
              ? `since ${new Date(totals.oldest).getFullYear()}`
              : undefined
          }
        />
        <StatTile
          label="Calendars"
          value={
            <AnimatedNumber value={stats.data?.perCalendar.length ?? 0} />
          }
        />
        <StatTile
          label="Audit entries"
          value={<AnimatedNumber value={totals?.auditEntries ?? 0} />}
          sublabel="every change recorded"
        />
        <StatTile
          label="Deletions preserved"
          value={<AnimatedNumber value={totals?.cancelled ?? 0} />}
          sublabel="kept, not lost"
        />
      </div>

      {/* Calendar sync worker */}
      <Card>
        <CardHeader>
          <CardTitle>Calendar sync worker</CardTitle>
          <CardDescription>
            The background Google Calendar archival sync, refreshing every few
            seconds while this tab is open
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LiveSyncPanel data={live.data} />
        </CardContent>
      </Card>

      {/* Contacts + Grist CRM sync worker */}
      <Card>
        <CardHeader>
          <CardTitle>Contacts &amp; Grist CRM sync worker</CardTitle>
          <CardDescription>
            People derived from your calendar plus the CRM overlay, and the
            background worker that pulls them from Grist
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Contacts"
              value={<AnimatedNumber value={stats.data?.contacts.people ?? 0} />}
              accent
            />
            <StatTile
              label="CRM profiles"
              value={
                <AnimatedNumber
                  value={stats.data?.contacts.crmProfiles ?? 0}
                />
              }
              sublabel="enriched from Grist"
            />
            <StatTile
              label="With company"
              value={
                <AnimatedNumber
                  value={stats.data?.contacts.withCompany ?? 0}
                />
              }
            />
            <StatTile
              label="With photo"
              value={
                <AnimatedNumber value={stats.data?.contacts.withPhoto ?? 0} />
              }
            />
          </div>
          <GristSyncPanel data={live.data?.grist} />
        </CardContent>
      </Card>

      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>When your events happen</CardTitle>
          <CardDescription>
            Every timed event across all history, stacked by weekday and hour of
            day
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.data ? (
            <HourWeekHeatmap grid={stats.data.heatmap} />
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Events per year</CardTitle>
            <CardDescription>How far back the archive reaches</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.data ? (
              <YearBarChart data={stats.data.perYear} />
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Loading…
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Events per calendar</CardTitle>
            <CardDescription>Where your history comes from</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.data ? (
              <CalendarBreakdown data={stats.data.perCalendar} />
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Loading…
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {stats.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Failed to load statistics.
        </div>
      )}
    </div>
  );
}
