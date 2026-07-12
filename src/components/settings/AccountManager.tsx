import { useCallback, useEffect, useState } from "react";

import { AlertCircle, AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { logger } from "@/lib/logger";

import {
  ConnectedCalendarSummary,
  useSettingsStore,
} from "@/store/settings";

import { AvailableCalendars } from "./AvailableCalendars";
import { CalDAVAccountForm } from "./CalDAVAccountForm";

const LOG_SOURCE = "AccountManager";

function calendarSyncStatus(calendar: ConnectedCalendarSummary): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} | null {
  if (calendar.backfillError) {
    return { label: "backfill error", variant: "destructive" };
  }
  if (!calendar.enabled) {
    return { label: "disabled", variant: "outline" };
  }
  if (!calendar.backfillComplete) {
    return {
      label: calendar.backfillCursor ? "backfilling…" : "backfill queued",
      variant: "secondary",
    };
  }
  if (calendar.lastSync) {
    return null; // healthy: the live SyncAgeCounter is shown instead
  }
  return { label: "archived", variant: "outline" };
}

function formatSyncAge(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  if (hours > 0) return `${hours}h ${minutes}m ago`;
  if (minutes > 0) return `${minutes}m ${seconds}s ago`;
  return `${seconds}s ago`;
}

/** Live counter of time since the last sync, ticking every second. */
function SyncAgeCounter({ lastSync }: { lastSync: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Badge
      variant="outline"
      className="shrink-0 font-mono text-xs font-normal tabular-nums"
      title={`last synced ${new Date(lastSync).toLocaleString()}`}
    >
      synced {formatSyncAge(now - new Date(lastSync).getTime())}
    </Badge>
  );
}

function formatCount(n: number | undefined): string {
  return (n ?? 0).toLocaleString();
}

interface IntegrationStatus {
  google: { configured: boolean };
  outlook: { configured: boolean };
}

export function AccountManager() {
  const { accounts, refreshAccounts, removeAccount } = useSettingsStore();
  const [showAvailableFor, setShowAvailableFor] = useState<string | null>(null);
  const [showCalDAVForm, setShowCalDAVForm] = useState(false);
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus>(
    {
      google: { configured: false },
      outlook: { configured: false },
    }
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  useEffect(() => {
    // Fetch integration status
    fetch("/api/integration-status")
      .then((res) => res.json())
      .then((data) => {
        setIntegrationStatus(data);
        setIsLoading(false);
      })
      .catch((error) => {
        logger.error(
          "Failed to fetch integration status",
          { error: error instanceof Error ? error.message : "Unknown error" },
          LOG_SOURCE
        );
        setIsLoading(false);
      });
  }, []);

  const handleConnect = (provider: "GOOGLE" | "OUTLOOK") => {
    if (provider === "GOOGLE") {
      window.location.href = `/api/calendar/google/auth`;
    } else if (provider === "OUTLOOK") {
      window.location.href = `/api/calendar/outlook/auth`;
    }
  };

  const handleConfirmedRemove = async (accountId: string) => {
    try {
      setIsRemoving(true);
      await removeAccount(accountId);
      setRemoveTargetId(null);
    } catch (error) {
      console.error("Failed to remove account:", error);
    } finally {
      setIsRemoving(false);
    }
  };

  const toggleAvailableCalendars = useCallback((accountId: string) => {
    setShowAvailableFor((current) =>
      current === accountId ? null : accountId
    );
  }, []);

  const handleCalDAVSuccess = () => {
    setShowCalDAVForm(false);
    refreshAccounts();
  };

  const removeTarget = accounts?.find((a) => a.id === removeTargetId) ?? null;
  const removeEventTotal =
    removeTarget?.calendars.reduce(
      (sum, c) => sum + (c.eventCount ?? 0),
      0
    ) ?? 0;
  const removeChangeTotal =
    removeTarget?.calendars.reduce(
      (sum, c) => sum + (c.changeCount ?? 0),
      0
    ) ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
          <CardDescription>
            Manage your connected calendar accounts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!integrationStatus.google.configured && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Missing Google Credentials</AlertTitle>
              <AlertDescription>
                Please contact your administrator to configure Google Calendar
                integration.
              </AlertDescription>
            </Alert>
          )}

          {!integrationStatus.outlook.configured && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Missing Outlook Credentials</AlertTitle>
              <AlertDescription>
                Please contact your administrator to configure Outlook Calendar
                integration.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => handleConnect("GOOGLE")}
              disabled={!integrationStatus.google.configured || isLoading}
            >
              Connect Google Calendar
            </Button>
            <Button
              onClick={() => handleConnect("OUTLOOK")}
              disabled={!integrationStatus.outlook.configured || isLoading}
            >
              Connect Outlook Calendar
            </Button>
            <Button onClick={() => setShowCalDAVForm(true)} variant="outline">
              Connect CalDAV Calendar
            </Button>
          </div>

          {showCalDAVForm && (
            <Card>
              <CardContent className="pt-6">
                <CalDAVAccountForm
                  onSuccess={handleCalDAVSuccess}
                  onCancel={() => setShowCalDAVForm(false)}
                />
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {accounts?.map((account) => (
              <div key={account.id} className="space-y-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            account.provider === "GOOGLE"
                              ? "default"
                              : account.provider === "OUTLOOK"
                                ? "secondary"
                                : "outline"
                          }
                          className="capitalize"
                        >
                          {account.provider.toLowerCase()}
                        </Badge>
                        <span className="text-sm font-medium">
                          {account.email}
                        </span>
                        {account.provider === "CALDAV" &&
                          account.caldavUrl && (
                            <span
                              className="text-muted-foreground max-w-full truncate text-xs"
                              title={account.caldavUrl}
                            >
                              {account.caldavUrl}
                            </span>
                          )}
                        <Badge variant="outline" className="text-xs">
                          {account.calendars.length} calendars
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleAvailableCalendars(account.id)}
                        >
                          {showAvailableFor === account.id
                            ? "Hide Available"
                            : "Add Calendars"}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setRemoveTargetId(account.id)}
                        >
                          Remove…
                        </Button>
                      </div>
                    </div>

                    {account.calendars.length > 0 && (
                      <div className="mt-4 space-y-1 border-t pt-4">
                        {account.calendars.map((calendar) => {
                          const status = calendarSyncStatus(calendar);
                          return (
                            <div
                              key={calendar.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span
                                  className="h-3 w-3 shrink-0 rounded-full border"
                                  style={{
                                    backgroundColor:
                                      calendar.color || "#3b82f6",
                                  }}
                                />
                                <span className="truncate text-sm">
                                  {calendar.name}
                                </span>
                                <span
                                  className="shrink-0 text-xs text-muted-foreground"
                                  title={
                                    calendar.backfillCursor
                                      ? `${formatCount(calendar.changeCount)} audit entries · archive reaches back to ${new Date(calendar.backfillCursor).toLocaleDateString()}`
                                      : `${formatCount(calendar.changeCount)} audit entries`
                                  }
                                >
                                  {formatCount(calendar.eventCount)} events
                                </span>
                              </div>
                              {status ? (
                                <Badge
                                  variant={status.variant}
                                  className="shrink-0 text-xs font-normal"
                                  title={calendar.backfillError || undefined}
                                >
                                  {status.label}
                                </Badge>
                              ) : (
                                calendar.lastSync && (
                                  <SyncAgeCounter
                                    lastSync={calendar.lastSync}
                                  />
                                )
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
                {showAvailableFor === account.id && (
                  <Card>
                    <CardContent className="pt-6">
                      <AvailableCalendars
                        accountId={account.id}
                        provider={account.provider}
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={removeTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTargetId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Erase all calendar history?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm">
                <p>
                  This permanently deletes the local archive for{" "}
                  <span className="font-medium text-foreground">
                    {removeTarget?.email}
                  </span>{" "}
                  and disconnects the account.
                </p>
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <div className="font-medium text-foreground">
                    You will lose:
                  </div>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    <li>
                      {formatCount(removeEventTotal)} archived events across{" "}
                      {removeTarget?.calendars.length ?? 0} calendars
                    </li>
                    <li>
                      {formatCount(removeChangeTotal)} audit-log entries (the
                      full change history)
                    </li>
                  </ul>
                </div>
                <p className="text-muted-foreground">
                  This cannot be undone. To get any of this data back you would
                  have to reconnect the calendar and re-run the full backfill,
                  which only recovers events that still exist in Google today —
                  anything since deleted upstream is gone for good.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveTargetId(null)}
              disabled={isRemoving}
            >
              Keep my data
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                removeTargetId && handleConfirmedRemove(removeTargetId)
              }
              disabled={isRemoving}
            >
              {isRemoving
                ? "Erasing…"
                : `Erase ${formatCount(removeEventTotal)} events`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
