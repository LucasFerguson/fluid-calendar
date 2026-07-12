import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export function ApiKeysSettings() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<"read" | "read,write">("read");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/api-keys");
    if (res.ok) setKeys(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || "API key", scopes }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.key);
        setName("");
        await load();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this key? Applications using it will stop working."))
      return;
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>
            Create keys so other applications in your homelab can read (and
            optionally write) your calendar and task data. Send the key as{" "}
            <code className="rounded bg-muted px-1">
              Authorization: Bearer &lt;key&gt;
            </code>{" "}
            or an <code className="rounded bg-muted px-1">X-API-Key</code>{" "}
            header. See <code className="rounded bg-muted px-1">docs/API.md</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                placeholder="e.g. Home Dashboard"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="key-scope">Access</Label>
              <select
                id="key-scope"
                value={scopes}
                onChange={(e) =>
                  setScopes(e.target.value as "read" | "read,write")
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="read">Read-only</option>
                <option value="read,write">Read &amp; write</option>
              </select>
            </div>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Creating…" : "Create key"}
            </Button>
          </div>

          {newKey && (
            <div className="rounded-md border border-emerald-400/50 bg-emerald-50 p-3 dark:bg-emerald-950/30">
              <p className="text-sm font-medium">
                Copy your new key now — it won&apos;t be shown again:
              </p>
              <code className="mt-1 block break-all rounded bg-background px-2 py-1 text-sm">
                {newKey}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  navigator.clipboard?.writeText(newKey);
                }}
              >
                Copy
              </Button>
            </div>
          )}

          <div className="divide-y divide-border">
            {keys.map((k) => (
              <div
                key={k.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">{k.name}</span>
                  <code className="text-xs text-muted-foreground">
                    {k.prefix}…
                  </code>
                  <Badge variant="outline" className="text-xs">
                    {k.scopes === "read,write" ? "read & write" : "read-only"}
                  </Badge>
                  {k.revokedAt && (
                    <Badge variant="destructive" className="text-xs">
                      revoked
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {k.lastUsedAt
                      ? `used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                      : "never used"}
                  </span>
                  {!k.revokedAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleRevoke(k.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {keys.length === 0 && (
              <p className="py-4 text-sm text-muted-foreground">
                No API keys yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
