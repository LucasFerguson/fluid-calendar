import { getToken } from "next-auth/jwt";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

import { Calendar } from "@/components/calendar/Calendar";

import { prisma } from "@/lib/prisma";

import { CalendarFeed } from "@/types/calendar";

export default async function HomePage() {
  const cookieHeader = await cookies();
  const req = new NextRequest(process.env.NEXTAUTH_URL as string, {
    headers: { cookie: cookieHeader.toString() },
  });
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });


  const userId = token?.sub;

  let feeds: CalendarFeed[] = [];

  if (userId) {
    // Fetch calendar feeds
    const dbFeeds = await prisma.calendarFeed.findMany({
      where: {
        userId: userId,
      },
      include: {
        account: {
          select: {
            id: true,
            provider: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Transform to match expected types
    feeds = dbFeeds.map((feed) => ({
      id: feed.id,
      name: feed.name,
      url: feed.url || undefined,
      type: feed.type as "GOOGLE" | "OUTLOOK" | "CALDAV",
      color: feed.color || undefined,
      enabled: feed.enabled,
      createdAt: feed.createdAt,
      updatedAt: feed.updatedAt,
      lastSync: feed.lastSync || undefined,
      error: feed.error || undefined,
      syncToken: feed.syncToken || undefined,
      channelId: feed.channelId || undefined,
      resourceId: feed.resourceId || undefined,
      channelExpiration: feed.channelExpiration || undefined,
      userId: feed.userId || undefined,
      accountId: feed.accountId || undefined,
      caldavPath: feed.caldavPath || undefined,
      ctag: feed.ctag || undefined,
      account: feed.account,
    }));
  }

  // Events are intentionally NOT preloaded here. The old unbounded SSR fetch
  // pulled the user's entire event archive (including cancelled/archived rows,
  // which it never filtered) into the first paint — the worst over-fetch and
  // the source of archived-events-on-first-load. We now pass an empty set so
  // Calendar falls back to the client fetch path (which is cancelled-filtered)
  // until WS3 swaps it to the windowed GET /api/calendar/events endpoint.
  return (
    <div className="absolute inset-0">
      <Calendar initialFeeds={feeds} initialEvents={[]} />
    </div>
  );
}
