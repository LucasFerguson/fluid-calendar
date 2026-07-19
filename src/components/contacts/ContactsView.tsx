"use client";

import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { HiChevronDown, HiChevronUp } from "react-icons/hi";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { cn } from "@/lib/utils";

import { ContactAvatar } from "./ContactAvatar";
import { ContactDetailDialog } from "./ContactDetailDialog";
import { formatDay } from "./format";
import { ContactsResponse, ContactSummary } from "./types";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

// Radix Select items can't have an empty-string value, so "all" is a sentinel.
const ALL_COMPANIES = "all";

type SortKey =
  | "name"
  | "company"
  | "firstMet"
  | "lastMeeting"
  | "nextMeeting"
  | "meetings";
type SortDir = "asc" | "desc";

// The direction a column starts in on first click (dates/counts most-first).
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  company: "asc",
  firstMet: "desc",
  lastMeeting: "desc",
  nextMeeting: "asc",
  meetings: "desc",
};

function displayName(c: ContactSummary): string {
  return (c.name || c.email).toLowerCase();
}

// Comparator that always sinks null/empty values to the bottom regardless of
// direction, so "no company" / "no meeting" rows don't crowd the top.
function compare(a: ContactSummary, b: ContactSummary, key: SortKey): number {
  switch (key) {
    case "name":
      return displayName(a).localeCompare(displayName(b));
    case "company": {
      const av = a.company?.toLowerCase() ?? "";
      const bv = b.company?.toLowerCase() ?? "";
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return av.localeCompare(bv);
    }
    case "meetings":
      return a.meetings - b.meetings;
    default: {
      // Date columns: wall-clock ISO strings sort lexically = chronologically.
      const av = a[key];
      const bv = b[key];
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return av < bv ? -1 : av > bv ? 1 : 0;
    }
  }
}

export function ContactsView() {
  const [selected, setSelected] = useState<ContactSummary | null>(null);
  const [company, setCompany] = useState<string>(ALL_COMPANIES);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "lastMeeting",
    dir: "desc",
  });

  const contacts = useQuery<ContactsResponse>({
    queryKey: ["contacts"],
    queryFn: () => fetchJson<ContactsResponse>("/api/contacts"),
  });

  const all = useMemo(
    () => contacts.data?.contacts ?? [],
    [contacts.data?.contacts]
  );

  // Companies come from the CRM profile overlay; the filter only appears once
  // at least one contact has one.
  const companies = useMemo(
    () =>
      [...new Set(all.map((c) => c.company).filter((c): c is string => !!c))]
        .sort((a, b) => a.localeCompare(b)),
    [all]
  );

  const rows = useMemo(() => {
    const filtered =
      company === ALL_COMPANIES
        ? all
        : all.filter((c) => c.company === company);
    const factor = sort.dir === "asc" ? 1 : -1;
    // Copy before sorting; a stable email tiebreak keeps order deterministic.
    return [...filtered].sort(
      (a, b) => compare(a, b, sort.key) * factor || a.email.localeCompare(b.email)
    );
  }, [all, company, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: DEFAULT_DIR[key] }
    );

  function SortHeader({
    label,
    sortKey,
    className,
  }: {
    label: string;
    sortKey: SortKey;
    className?: string;
  }) {
    const active = sort.key === sortKey;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => toggleSort(sortKey)}
          className={cn(
            "inline-flex items-center gap-1 hover:text-foreground",
            active && "font-medium text-foreground"
          )}
        >
          {label}
          {active &&
            (sort.dir === "asc" ? (
              <HiChevronUp className="h-3.5 w-3.5" />
            ) : (
              <HiChevronDown className="h-3.5 w-3.5" />
            ))}
        </button>
      </TableHead>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            Everyone you&apos;ve shared a calendar event with
            {contacts.data
              ? ` · ${rows.length} ${rows.length === 1 ? "person" : "people"} · times shown in ${contacts.data.timeZone}`
              : ""}
          </p>
        </div>
        {companies.length > 0 && (
          <Select value={company} onValueChange={setCompany}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Company" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_COMPANIES}>All companies</SelectItem>
              {companies.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
          {all.length > 0 ? (
            <p>No contacts at this company.</p>
          ) : (
            <>
              <p>No contacts found yet.</p>
              <p className="mt-2">
                Contacts are derived from event guests, which are captured as
                events sync. Events archived before guest capture was added
                will appear here once they&apos;re re-observed or backfilled.
              </p>
            </>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-md border border-border">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <SortHeader label="Contact" sortKey="name" />
                <SortHeader label="Company" sortKey="company" />
                <SortHeader
                  label="First met"
                  sortKey="firstMet"
                  className="w-28"
                />
                <SortHeader
                  label="Last meeting"
                  sortKey="lastMeeting"
                  className="w-32"
                />
                <SortHeader
                  label="Next meeting"
                  sortKey="nextMeeting"
                  className="w-32"
                />
                <SortHeader
                  label="Meetings"
                  sortKey="meetings"
                  className="w-32 text-right [&>button]:justify-end"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow
                  key={c.email}
                  className="cursor-pointer"
                  onClick={() => setSelected(c)}
                >
                  <TableCell className="max-w-0">
                    <div className="flex items-center gap-3">
                      <ContactAvatar
                        name={c.name}
                        email={c.email}
                        photoUrl={c.photoUrl}
                      />
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
                  <TableCell className="max-w-0 truncate text-muted-foreground">
                    {c.company || "—"}
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
                    {c.meetings > 0 ? (
                      c.meetings.toLocaleString()
                    ) : (
                      <Badge
                        variant="outline"
                        className="font-normal text-muted-foreground"
                      >
                        No meetings yet
                      </Badge>
                    )}
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
