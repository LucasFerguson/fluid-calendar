"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface GristStatus {
  configured: boolean;
  baseUrl: string | null;
  docId: string | null;
  connectionsTable: string;
  companiesTable: string;
  apiKeySet: boolean;
  lastSync: {
    lastSyncAt: string;
    synced: number;
    skippedNoEmail: number;
    photosDownloaded: number;
    errors: string[];
  } | null;
}

// Read-only connection card for the external Grist CRM. Deliberately not
// editable here - the wiring lives in .env (GRIST_*); this card is a reminder
// of how the integration is connected, plus a manual sync trigger.
export function GristConnectionCard() {
  const queryClient = useQueryClient();

  const status = useQuery<GristStatus>({
    queryKey: ["grist-status"],
    queryFn: async () => {
      const res = await fetch("/api/grist/status");
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return res.json();
    },
  });

  const sync = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/grist/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      return body as NonNullable<GristStatus["lastSync"]>;
    },
    onSuccess: (summary) => {
      toast.success(
        `Grist sync complete: ${summary.synced} contact${summary.synced === 1 ? "" : "s"}, ${summary.photosDownloaded} photo${summary.photosDownloaded === 1 ? "" : "s"}` +
          (summary.errors.length ? `, ${summary.errors.length} errors` : "")
      );
      queryClient.invalidateQueries({ queryKey: ["grist-status"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Grist sync failed");
    },
  });

  const data = status.data;
  if (!data || !data.baseUrl) {
    // Nothing configured at all - don't advertise an integration that isn't
    // wired up on this deployment.
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Grist CRM</CardTitle>
            <CardDescription>
              External contacts database, pulled one-way into the Contacts
              page. Configured in <code>.env</code> (read-only here).
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => sync.mutate()}
            disabled={!data.configured || sync.isPending}
          >
            {sync.isPending ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 sm:justify-start sm:gap-2">
            <dt className="text-muted-foreground">Server</dt>
            <dd className="font-mono">{data.baseUrl}</dd>
          </div>
          <div className="flex justify-between gap-4 sm:justify-start sm:gap-2">
            <dt className="text-muted-foreground">Document</dt>
            <dd className="break-all font-mono">{data.docId ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 sm:justify-start sm:gap-2">
            <dt className="text-muted-foreground">Tables</dt>
            <dd className="font-mono">
              {data.connectionsTable}, {data.companiesTable}
            </dd>
          </div>
          <div className="flex justify-between gap-4 sm:justify-start sm:gap-2">
            <dt className="text-muted-foreground">API key</dt>
            <dd>
              {data.apiKeySet ? (
                <Badge variant="secondary">set</Badge>
              ) : (
                <Badge variant="destructive">missing — add GRIST_API_KEY</Badge>
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-4 sm:col-span-2 sm:justify-start sm:gap-2">
            <dt className="text-muted-foreground">Last sync</dt>
            <dd>
              {data.lastSync
                ? `${new Date(data.lastSync.lastSyncAt).toLocaleString()} — ${data.lastSync.synced} contacts, ${data.lastSync.photosDownloaded} photos` +
                  (data.lastSync.skippedNoEmail
                    ? `, ${data.lastSync.skippedNoEmail} without email skipped`
                    : "")
                : "never"}
            </dd>
          </div>
          {data.lastSync && data.lastSync.errors.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="mb-1 text-muted-foreground">Sync errors</dt>
              <dd className="space-y-0.5 text-xs text-destructive">
                {data.lastSync.errors.slice(0, 5).map((e) => (
                  <div key={e}>{e}</div>
                ))}
                {data.lastSync.errors.length > 5 && (
                  <div>…and {data.lastSync.errors.length - 5} more</div>
                )}
              </dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
