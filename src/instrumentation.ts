// Next.js server-startup hook (stable in Next 15). Runs once per server
// process for both `next dev` and `next start`, which is what lets the
// Google Calendar archival sync run continuously without a separate worker.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startGoogleCalendarSyncScheduler } = await import(
      "@/lib/google-calendar-sync/scheduler"
    );
    startGoogleCalendarSyncScheduler();

    const { startGristSyncScheduler } = await import("@/lib/grist/scheduler");
    startGristSyncScheduler();
  }
}
