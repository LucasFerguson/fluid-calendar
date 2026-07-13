"use client";

import { useQuery } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { getEventColors } from "@/lib/calendar-colors";

import { ContactAvatar } from "./ContactAvatar";
import { formatDay, formatDayTime } from "./format";
import { ContactDetailResponse, ContactEvent, ContactSummary } from "./types";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

interface Props {
  contact: ContactSummary | null;
  onClose: () => void;
}

function Milestone({
  label,
  event,
}: {
  label: string;
  event: ContactEvent | undefined;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {event ? (
        <>
          <div className="mt-1 truncate text-sm font-medium" title={event.title ?? undefined}>
            {event.title || "(untitled)"}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatDay(event.start)}
          </div>
        </>
      ) : (
        <div className="mt-1 text-sm text-muted-foreground">—</div>
      )}
    </div>
  );
}

export function ContactDetailDialog({ contact, onClose }: Props) {
  const detail = useQuery<ContactDetailResponse>({
    queryKey: ["contact", contact?.email],
    queryFn: () =>
      fetchJson<ContactDetailResponse>(
        `/api/contacts/${encodeURIComponent(contact?.email ?? "")}`
      ),
    enabled: !!contact,
  });

  // Events arrive oldest-first; the three milestones fall out directly.
  const events = detail.data?.events ?? [];
  const firstMet = events[0];
  const lastMeeting = [...events].reverse().find((e) => e.isPast);
  const nextMeeting = events.find((e) => !e.isPast);

  return (
    <Dialog open={!!contact} onOpenChange={(open) => !open && onClose()}>
      {/* grid-cols-[minmax(0,1fr)]: DialogContent is display:grid with an
          implicit column, whose track otherwise grows to the min-content of
          the nowrap/truncated event rows and overflows the dialog width. */}
      <DialogContent className="max-h-[85vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-lg">
        {contact && (
          <>
            <DialogHeader>
              <DialogTitle>
                <span className="flex items-center gap-3">
                  <ContactAvatar
                    name={contact.name}
                    email={contact.email}
                    photoUrl={contact.photoUrl}
                    className="h-9 w-9"
                  />
                  <span className="min-w-0">
                    <span className="block truncate">
                      {contact.name || contact.email}
                    </span>
                    {contact.name && (
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        {contact.email}
                      </span>
                    )}
                  </span>
                </span>
              </DialogTitle>
              <DialogDescription>
                {[contact.title, contact.company]
                  .filter(Boolean)
                  .join(" · ") || null}
                {(contact.title || contact.company) && " — "}
                {contact.meetings.toLocaleString()}{" "}
                {contact.meetings === 1 ? "shared event" : "shared events"}
              </DialogDescription>
            </DialogHeader>

            {detail.isLoading && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Loading…
              </div>
            )}

            {detail.isError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                Failed to load shared events.
              </div>
            )}

            {detail.data && (
              <div className="space-y-4">
                {detail.data.profile &&
                  (detail.data.profile.phone || detail.data.profile.notes) && (
                    <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm">
                      {detail.data.profile.phone && (
                        <div>
                          <span className="text-muted-foreground">Phone: </span>
                          {detail.data.profile.phone}
                        </div>
                      )}
                      {detail.data.profile.notes && (
                        <div className="whitespace-pre-wrap text-muted-foreground">
                          {detail.data.profile.notes}
                        </div>
                      )}
                    </div>
                  )}
                <div className="grid gap-2 sm:grid-cols-3">
                  <Milestone label="First met" event={firstMet} />
                  <Milestone label="Last meeting" event={lastMeeting} />
                  <Milestone label="Next meeting" event={nextMeeting} />
                </div>

                <div>
                  <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                    All shared events
                  </div>
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {events.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-center gap-3 px-3 py-2 text-sm"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          title={e.calendarName}
                          style={{
                            backgroundColor: getEventColors(e.calendarColor)
                              .borderColor,
                          }}
                        />
                        <span
                          className="min-w-0 flex-1 truncate"
                          title={e.title ?? undefined}
                        >
                          {e.title || "(untitled)"}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                          {formatDayTime(e.start, e.allDay)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
