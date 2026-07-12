import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { getSyncProgress } from "@/lib/google-calendar-sync/sync-progress";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "StatsLiveAPI";

// Lightweight, frequently-polled snapshot of sync activity for the live
// dashboard: per-feed backfill/sync state (with event counts) plus the most
// recent change-log entries. Kept cheap so it can refresh every few seconds
// while the Statistics tab is open.

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }
    const userId = auth.userId;

    const [feeds, recent] = await Promise.all([
      prisma.calendarFeed.findMany({
        where: { userId: userId ?? "", type: "GOOGLE" },
        select: {
          id: true,
          name: true,
          color: true,
          enabled: true,
          lastSync: true,
          backfillComplete: true,
          backfillCursor: true,
          backfillError: true,
          _count: { select: { events: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.calendarEventChange.findMany({
        where: { feed: { userId: userId ?? "" } },
        select: {
          id: true,
          changeType: true,
          source: true,
          timestamp: true,
          externalEventId: true,
          feed: { select: { name: true, color: true } },
        },
        orderBy: { timestamp: "desc" },
        take: 25,
      }),
    ]);

    const progress = getSyncProgress();

    return NextResponse.json({
      now: new Date().toISOString(),
      progress,
      feeds: feeds.map(({ _count, ...f }) => ({
        ...f,
        eventCount: _count.events,
      })),
      recentActivity: recent.map((c) => ({
        id: c.id,
        changeType: c.changeType,
        source: c.source,
        timestamp: c.timestamp,
        calendarName: c.feed.name,
        calendarColor: c.feed.color,
      })),
    });
  } catch (error) {
    logger.error(
      "Failed to load live sync status",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to load live sync status" },
      { status: 500 }
    );
  }
}
