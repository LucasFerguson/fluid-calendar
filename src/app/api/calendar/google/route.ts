import { NextRequest, NextResponse } from "next/server";

import { GaxiosError } from "gaxios";
import { google } from "googleapis";
import { v4 as uuidv4 } from "uuid";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { createGoogleOAuthClient } from "@/lib/google";
import { getGoogleCalendarClient } from "@/lib/google-calendar";
import { syncFeedNow } from "@/lib/google-calendar-sync/scheduler";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { TokenManager } from "@/lib/token-manager";

const LOG_SOURCE = "GoogleCalendarAPI";

// Handle Google OAuth callback and account connection
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const codeParam = url.searchParams.get("code");

    if (!codeParam) {
      return NextResponse.json({ error: "No code provided" }, { status: 400 });
    }
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const oauth2Client = await createGoogleOAuthClient({
      redirectUrl: `${process.env.NEXTAUTH_URL}/api/calendar/google`,
    });

    try {
      // Exchange code for tokens
      const code: string = codeParam;
      const tokenResponse = await oauth2Client.getToken(code);
      const tokens = tokenResponse.tokens;
      oauth2Client.setCredentials(tokens);

      // Get user info to get email
      const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();

      if (!userInfo.data.email) {
        return NextResponse.json(
          { error: "Could not get user email" },
          { status: 400 }
        );
      }

      // Store tokens
      const tokenManager = TokenManager.getInstance();
      const accountId = await tokenManager.storeTokens(
        "GOOGLE",
        userInfo.data.email,
        {
          accessToken: tokens.access_token!,
          refreshToken: tokens.refresh_token!,
          // expiry_date is an absolute epoch-ms timestamp from google-auth-library,
          // not a duration. Adding Date.now() pushed expiry decades out, so the
          // token was never refreshed and every later call 401'd.
          expiresAt: newDate(tokens.expiry_date || Date.now() + 3600 * 1000),
        },
        userId ?? "unknown"
      );

      // Get list of calendars
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });
      const calendarList = await calendar.calendarList.list();

      // Store calendars
      if (calendarList.data.items) {
        for (const cal of calendarList.data.items) {
          if (cal.id && cal.summary) {
            // Check if calendar feed already exists
            const existingFeed = await prisma.calendarFeed.findFirst({
              where: {
                type: "GOOGLE",
                url: cal.id,
                accountId,
                userId,
              },
            });

            // Only create if it doesn't exist
            if (!existingFeed) {
              await prisma.calendarFeed.create({
                data: {
                  id: uuidv4(),
                  name: cal.summary,
                  url: cal.id,
                  type: "GOOGLE",
                  color: cal.backgroundColor ?? undefined,
                  accountId,
                  userId,
                },
              });
            }
          }
        }
      }

      return NextResponse.redirect(
        new URL("/settings", process.env.NEXTAUTH_URL!)
      );
    } catch (error) {
      console.error("Failed to exchange code for tokens:", error);
      return NextResponse.json(
        { error: "Failed to authenticate with Google" },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error("Google Calendar OAuth error:", error);
    return NextResponse.json(
      { error: "Failed to authenticate with Google" },
      { status: 500 }
    );
  }
}

// Add a Google Calendar to sync
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { accountId, calendarId, name, color } = await request.json();

    if (!accountId || !calendarId) {
      return NextResponse.json(
        { error: "Account ID and Calendar ID are required" },
        { status: 400 }
      );
    }

    // Check if account belongs to the current user
    const account = await prisma.connectedAccount.findUnique({
      where: {
        id: accountId,
        userId,
      },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Check if calendar already exists
    const existingFeed = await prisma.calendarFeed.findFirst({
      where: {
        type: "GOOGLE",
        url: calendarId,
        accountId,
        userId,
      },
    });

    if (existingFeed) {
      return NextResponse.json(existingFeed);
    }

    // Create calendar client
    const calendar = await getGoogleCalendarClient(accountId, userId);

    // Verify access to the calendar
    try {
      await calendar.calendars.get({
        calendarId,
      });
    } catch (error) {
      console.error("Failed to access calendar:", error);
      return NextResponse.json(
        { error: "Failed to access calendar" },
        { status: 403 }
      );
    }

    // Create calendar feed. Events are NOT fetched inline: the background
    // archival scheduler picks up the new feed (backfillComplete=false) on
    // its next tick and performs the throttled full-history backfill.
    const feed = await prisma.calendarFeed.create({
      data: {
        id: uuidv4(),
        name,
        url: calendarId,
        type: "GOOGLE",
        color,
        accountId,
        userId,
      },
    });

    return NextResponse.json(feed);
  } catch (error) {
    console.error("Failed to add calendar:", error);
    return NextResponse.json(
      { error: "Failed to add calendar" },
      { status: 500 }
    );
  }
}

// Sync specific calendar
export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;

    const { feedId } = await request.json();

    if (!feedId) {
      return NextResponse.json(
        { error: "Feed ID is required" },
        { status: 400 }
      );
    }

    // Run one sync pass through the archival engine: a (resumable) full
    // backfill if this feed hasn't completed one, otherwise an incremental
    // delta via the stored sync token. Idempotent upserts only - the old
    // delete-all-and-reinsert behavior is gone.
    const { mode, result } = await syncFeedNow(feedId, userId ?? "");

    logger.info(
      "Manual Google calendar sync finished",
      { feedId, mode, ...result },
      LOG_SOURCE
    );
    return NextResponse.json({ success: true, mode, ...result });
  } catch (error: unknown) {
    console.error("Failed to sync Google calendar:", error);

    // Check if it's an auth error
    if (error instanceof GaxiosError && Number(error.code) === 401) {
      return NextResponse.json(
        { error: "Authentication failed. Please try signing in again." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Failed to sync calendar" },
      { status: 500 }
    );
  }
}
