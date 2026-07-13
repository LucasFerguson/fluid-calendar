"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { ContactDetailDialog } from "./ContactDetailDialog";
import { formatDay, initials } from "./format";
import { ContactsResponse, ContactSummary } from "./types";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export function ContactsView() {
  const [selected, setSelected] = useState<ContactSummary | null>(null);

  const contacts = useQuery<ContactsResponse>({
    queryKey: ["contacts"],
    queryFn: () => fetchJson<ContactsResponse>("/api/contacts"),
  });

  const rows = contacts.data?.contacts ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Contacts</h1>
        <p className="text-sm text-muted-foreground">
          Everyone you&apos;ve shared a calendar event with
          {contacts.data
            ? ` · ${rows.length} ${rows.length === 1 ? "person" : "people"} · times shown in ${contacts.data.timeZone}`
            : ""}
        </p>
      </div>

      {contacts.isLoading && (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      )}

      {contacts.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Failed to load contacts.
        </div>
      )}

      {contacts.data && rows.length === 0 && (
        <div className="rounded-md border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          <p>No contacts found yet.</p>
          <p className="mt-2">
            Contacts are derived from event guests, which are captured as
            events sync. Events archived before guest capture was added will
            appear here once they&apos;re re-observed or backfilled.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>First met</TableHead>
                <TableHead>Last meeting</TableHead>
                <TableHead>Next meeting</TableHead>
                <TableHead className="text-right">Meetings</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow
                  key={c.email}
                  className="cursor-pointer"
                  onClick={() => setSelected(c)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                        {initials(c.name, c.email)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {c.name || c.email}
                        </div>
                        {c.name && (
                          <div className="truncate text-xs text-muted-foreground">
                            {c.email}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDay(c.firstMet)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDay(c.lastMeeting)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {c.nextMeeting ? (
                      formatDay(c.nextMeeting)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.meetings.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ContactDetailDialog
        contact={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
