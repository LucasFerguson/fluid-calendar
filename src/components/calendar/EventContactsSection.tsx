import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HiOutlineDocumentAdd, HiPlus, HiX } from "react-icons/hi";
import { IoPeopleOutline } from "react-icons/io5";
import { toast } from "sonner";

import {
  buildMeetingNoteUri,
  isObsidianConfigured,
  MeetingNotePerson,
} from "@/lib/obsidian";
import { cn } from "@/lib/utils";

interface AttachedContact {
  email: string;
  name: string | null;
}

interface ContactSummary {
  email: string;
  name: string | null;
  company: string | null;
  photoUrl: string | null;
}

interface Props {
  eventId: string;
  title: string;
  start: Date | string;
  location?: string | null;
  // Google attendees already on the event (merged into the note, not editable).
  attendees?: Array<{ name?: string; email: string }>;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

// Locally attached contacts + the "Create meeting note" (Obsidian) button.
// Attaching is organizational only — it never touches the Google sync, so no
// invite is ever sent (see the EventContact model / the API route).
export function EventContactsSection({
  eventId,
  title,
  start,
  location,
  attendees = [],
}: Props) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  const attached = useQuery({
    queryKey: ["event-contacts", eventId],
    queryFn: () =>
      getJson<{ contacts: AttachedContact[] }>(
        `/api/events/${eventId}/contacts`
      ),
  });

  // Reuses the Contacts page cache when present; otherwise fetches once.
  const contacts = useQuery({
    queryKey: ["contacts"],
    queryFn: () =>
      getJson<{ contacts: ContactSummary[] }>("/api/contacts"),
    enabled: adding,
  });

  const attachedList = useMemo(
    () => attached.data?.contacts ?? [],
    [attached.data?.contacts]
  );
  const attachedEmails = useMemo(
    () => new Set(attachedList.map((c) => c.email.toLowerCase())),
    [attachedList]
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["event-contacts", eventId] });
  };

  const attach = useMutation({
    mutationFn: (c: { email: string; name: string | null }) =>
      fetch(`/api/events/${eventId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    onSuccess: () => {
      invalidate();
      setQuery("");
    },
    onError: () => toast.error("Couldn't attach contact"),
  });

  const detach = useMutation({
    mutationFn: (email: string) =>
      fetch(
        `/api/events/${eventId}/contacts?email=${encodeURIComponent(email)}`,
        { method: "DELETE" }
      ).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    onSuccess: invalidate,
    onError: () => toast.error("Couldn't remove contact"),
  });

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = contacts.data?.contacts ?? [];
    return list
      .filter((c) => !attachedEmails.has(c.email.toLowerCase()))
      .filter(
        (c) =>
          !q ||
          c.email.toLowerCase().includes(q) ||
          (c.name ?? "").toLowerCase().includes(q) ||
          (c.company ?? "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [contacts.data, query, attachedEmails]);

  // People written into the Obsidian note: Google attendees + local attaches.
  const notePeople: MeetingNotePerson[] = useMemo(() => {
    const byEmail = new Map<string, MeetingNotePerson>();
    for (const a of attendees) {
      if (a.email) byEmail.set(a.email.toLowerCase(), { name: a.name, email: a.email });
    }
    for (const c of attachedList) {
      byEmail.set(c.email.toLowerCase(), { name: c.name, email: c.email });
    }
    return [...byEmail.values()];
  }, [attendees, attachedList]);

  const openNote = () => {
    window.location.href = buildMeetingNoteUri({
      title,
      start,
      location,
      people: notePeople,
    });
  };

  return (
    <div className="space-y-2 border-t border-border pt-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <IoPeopleOutline className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wide">
            Attached people
          </span>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs hover:bg-muted",
            adding ? "text-primary" : "text-muted-foreground"
          )}
        >
          <HiPlus className="h-3.5 w-3.5" /> Attach
        </button>
      </div>

      {attachedList.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {attachedList.map((c) => (
            <span
              key={c.email}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
              title={c.email}
            >
              <span className="truncate">{c.name || c.email}</span>
              <button
                type="button"
                onClick={() => detach.mutate(c.email)}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                title="Remove"
              >
                <HiX className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {adding && (
        <div className="space-y-1">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts…"
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="max-h-40 overflow-y-auto rounded-md border border-border">
            {contacts.isLoading ? (
              <div className="p-2 text-xs text-muted-foreground">Loading…</div>
            ) : matches.length === 0 ? (
              <div className="p-2 text-xs text-muted-foreground">
                No matching contacts.
              </div>
            ) : (
              matches.map((c) => (
                <button
                  key={c.email}
                  type="button"
                  onClick={() => attach.mutate({ email: c.email, name: c.name })}
                  className="flex w-full flex-col items-start px-2 py-1 text-left hover:bg-muted"
                >
                  <span className="text-xs">{c.name || c.email}</span>
                  {c.name && (
                    <span className="text-[10px] text-muted-foreground">
                      {c.email}
                      {c.company ? ` · ${c.company}` : ""}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {isObsidianConfigured() && (
        <button
          type="button"
          onClick={openNote}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-primary"
          title="Create a meeting note in Obsidian"
        >
          <HiOutlineDocumentAdd className="h-4 w-4" />
          Create meeting note
        </button>
      )}
    </div>
  );
}
