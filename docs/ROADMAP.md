# Roadmap & Ideas

Future work for Lucas Ferguson's sovereign-archive fork of FluidCalendar. These
are ideas discussed but not yet built (or built partially), captured so they
survive across sessions. Companion to [`docs/archival-sync-design.md`](archival-sync-design.md)
(the archival sync's design + open questions) and [`docs/API.md`](API.md).

Status legend: 🔴 not started · 🟡 partial/foundation exists · 🟢 mostly there, needs polish

## Integrations

- 🔴 **Sleep from Google Pixel watch → calendar events.** Read sleep sessions
  from Lucas's existing health-data Postgres DB and write them as events into a
  dedicated **LOCAL** calendar feed (`type: "LOCAL"`, already supported). Show a
  per-sleep-cycle widget over the event via FullCalendar's `eventContent`
  customization (no fork needed). Pairs with the opacity base-layer idea below.
  Model as a new importer alongside `src/lib/task-sync/` providers.
- 🔴 **Weather on each day header.** Use **Open-Meteo** (free, no key) for North
  Chicago; render via FullCalendar `dayHeaderContent`. Temperature high/low +
  icon per day.

- 🟢 **Grist CRM pull** — shipped. `GRIST_*` in `.env` (server URL, API key, doc
  id, table names), read-only connection card under Settings → Accounts, manual
  `POST /api/grist/sync` pulling the `Connections` (+`Companies`) tables into
  `ContactProfile`. Photos are downloaded to `data/contact-photos/` and served
  from `/api/contact-photos/:file` so the UI never hot-links the Grist server.
  Follow-ons: scheduled sync (systemd timer or in-app interval), two-way sync.
- 🟢 **Obsidian meeting-note button** — shipped. "Create meeting note" on the
  event quick-view builds an `obsidian://new` URI (vault `Obsidian-Vault`,
  folder `001-Home/Meetings/`, both env-configurable via
  `NEXT_PUBLIC_OBSIDIAN_*`) pre-filled with title/date/attendees. `append=true`
  so re-clicking doesn't clobber notes. Follow-on: Advanced URI plugin for
  applying an in-vault template instead of inline content.

## Calendar UX

- 🟢 **Local-only attendees from contacts** — shipped as a separate
  `EventContact` join table (the Google sync never reads/writes it, so it's
  never pushed upstream), managed from the event quick-view popup. Possible
  follow-on Lucas floated: mirror attached people into the Google event's
  *description* (not attendees) so the names ride along without sending invites
  — would require touching the Google write path, so deferred.

- 🟡 **Markdown event descriptions.** Render the description as Markdown when the
  field isn't focused; swap to the raw textarea on click (click-to-edit). Code
  TODO already at the description field in `EventModal.tsx`
  (`TODO(description-markdown)`).
- 🔴 **Free/busy-driven time-blocking.** The event `transparency` field (busy vs
  free) isn't captured yet; combined with the per-calendar **opacity base layer**
  (already shipped), a faint "free/busy template" calendar could drive
  time-blocking. Capture `transparency` (see event-fields below) to enable.
- 🔴 **Richer quick-view / event detail:** show Meet links, attendee RSVP
  summary, organizer, once those fields are captured.

## Statistics / analytics

- 🟢 **"People" section** — shipped as the top-level **Contacts** page
  (`/contacts`, `GET /api/contacts[/:email]`): per-person first-met /
  last-meeting / next-meeting dates, meeting counts, and a detail view listing
  all shared events. Derived from `EventAttendee`, so it fills in as events are
  (re-)synced — sparse until the attendee backfill (below) runs. A
  `ContactProfile` overlay (company, title, phone, photo, notes) is writable by
  external CRMs via `PUT /api/contacts/:email`, and the page filters by
  company. Possible follow-ons: meeting load per person/week, RSVP rates,
  two-way CRM sync.
- 🟡 **Calendar filter on stats.** Subscribed calendars (US Holidays, school)
  skew the heatmap and per-year counts. Code TODO already in `/api/stats`
  (`TODO(stats-filter)`): accept `?calendarIds=` and default to owned calendars.

## Data model / fidelity

- 🔴 **Capture more Google event fields.** Currently projected: a solid subset.
  Not yet projected (but archived raw in `CalendarEventChange.changeData`):
  `conferenceData`/`hangoutLink` (Meet), `visibility`, `transparency` (free/busy),
  `colorId`, `reminders`, `attachments`, `htmlLink`, `iCalUID`, `creator`,
  `guestsCan*` flags, `extendedProperties`, `eventType`. Add columns for the
  high-value ones (Meet link, visibility, transparency, iCalUID, htmlLink).
- 🔴 **Recurrence-exception flagging.** Add `isException` + `originalStart` to
  distinguish a truly-overridden occurrence from a generated one, so the archive
  is faithfully re-exportable. (See design doc.)
- 🔴 **EventAttendee backfill.** The relational attendee rows populate on each
  sync of an event that carries attendees; already-synced events won't have rows
  until re-observed. A one-time backfill (re-derive from
  `CalendarEvent.attendees` JSON or `changeData`) would fill history. Not needed
  for the main account (its first backfill populates fresh).
- 🔴 **Token encryption at rest.** `ConnectedAccount.accessToken/refreshToken`
  are plaintext. Fine on-box; encrypt if the DB ever leaves the container.
- 🔴 **Change-log / cancelled-row growth.** `CalendarEventChange` and cancelled
  `CalendarEvent` rows grow unbounded by design. Eventually a compaction policy
  or a cold-storage table for cancelled history to keep the hot table lean.

## API / interop

- 🔴 **Read-only iCal / CalDAV export feed.** FluidCalendar is a CalDAV *client*,
  not a server, so other apps can't subscribe over CalDAV. A read-only iCal
  export (or minimal CalDAV) would let calendar apps subscribe directly. The
  REST API (`docs/API.md`, now API-key authed) is the current integration path.
- 🔴 **Per-endpoint rate limiting on API keys** and finer scopes than
  read / read-write. Intended for a trusted homelab today.
- 🔴 **Expose the change log via API** (`/api/stats` or a dedicated route) so
  external apps can consume the audit trail.

## Sync engine

- 🟢 **Open-ended series horizon refresh** — shipped (`horizon.ts`, daily
  forward-windowed re-list). Watch it on the first main-account backfill.
- 🔴 **`getGoogleEvent` windowed `events.instances`** (~`google-calendar.ts:375`)
  is still current-year-bounded; it feeds the single-event detail view, not the
  archive, so left as-is. Align with the archive if that view needs full history.

## Before connecting the main account (checklist)

- 🟢 Nightly DB backup (systemd timer) — done.
- 🟢 Non-destructive archival sync + horizon refresh — done.
- 🟡 Watch the first full backfill of ~29 feeds live on the Statistics page for
  any 403/quota backoff (big import calendars: Todoist, Canvas, TickTick).
- 🔴 Optionally add the stats calendar filter first so the heatmap reflects owned
  calendars, not holiday/school noise.
