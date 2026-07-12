# Google Calendar Archival Sync — Design & Decisions

Living design notes for the full-archival Google Calendar mirror added on top of
FluidCalendar. Captures how the data model works, decisions made, and the larger
changes worth considering next.

## Goal

Turn FluidCalendar's rolling one-year Google sync into a sovereign, full-history
archive: every event across every year, pulled locally and kept continuously in
sync, with a complete audit trail, running automatically (no button). Write-back
to Google remains the app's original behavior; the archive is pull-first.

## How events are stored (the recurring-event model)

Recurring events use a **hybrid master + expanded-instance** model:

- **Master row** (`isMaster = true`): one row per series, holding the
  `recurrenceRule` (RRULE), `externalEventId` = Google's recurring event id,
  `masterEventId = null`.
- **Instance rows** (`isMaster = false`): one row per occurrence, with
  `masterEventId` → the master row, `recurringEventId` = Google's series id, and
  `externalEventId` = `"{seriesId}_{UTCstamp}"` (e.g.
  `0pha6..._20260720T031500Z`). Each instance can independently diverge (a moved
  time or edited description = a "recurrence exception"), which is why per-instance
  rows are valuable.

Identity is `(feedId, externalEventId)` (unique). Deletions are never removed:
they are archived as `status = "cancelled"`. The UI (`/api/events`) filters those
out; the stats analytics exclude them; the archive keeps them forever.

### Instance explosion (important cost)

Backfill uses Google's `events.list` with `singleEvents: true` and **no time
bound**. Google expands each open-ended recurring series out to a bounded horizon
— empirically **~730 days (2 years)** of occurrences. So **one daily recurring
event = 1 master + ~730 instance rows.** Measured examples in the current DB each
produced exactly 730 instance rows.

Consequences:
- Row counts are dominated by recurring expansion, not distinct events.
- The archive only grows (cancelled instances are retained).
- The 2-year horizon is Google's, not ours — instances beyond it don't exist as
  rows until a future sync re-lists and the horizon rolls forward. **Open
  question:** nothing currently re-runs backfill to roll the horizon forward for
  open-ended series, so far-future occurrences of an infinite series will not be
  materialized until the sync token flow surfaces them. Worth verifying.

## "Delete this and following" (the requested feature)

Google's three-way recurring delete: *This event* / *This and following* / *All
events*. FluidCalendar currently supports only single (`"single"`) and whole
series (`"series"`) — there is no "this and following."

**What Google does under the hood for "this and following":** it does **not**
delete rows. It **truncates the master series' RRULE** by adding an
`UNTIL=<instant just before the selected occurrence>` (equivalently a `COUNT`).
Occurrences from the selected one onward simply stop being generated. Via the
Google Calendar API there is no single "this and following" call — you implement
it by `PATCH`-ing the master event's `recurrence` with the new `UNTIL`.

**How it already round-trips into our archive:** when the truncation is done in
Google, our incremental sync observes (a) the master event UPDATE (new RRULE with
UNTIL) and (b) the now-removed future occurrences as `status: cancelled`. That is
exactly why deleting "this and following" in Google correctly cleared the
post-cutoff instances locally — the archive mirrored it. (Confirmed on the
"GO TO SLEEP" series: 730 instances, 707 cancelled after an upstream truncate.)

### Implementation plan (not yet built)

Additive, no FullCalendar changes, no library fork:

1. **Types:** widen the delete mode from `"single" | "series"` to include
   `"thisAndFollowing"` (`src/store/calendar.ts`, `deleteGoogleEvent` in
   `src/lib/google-calendar.ts`, the DELETE route, `deleteCalendarEvent`).
2. **UI:** the recurrence dialog in `EventModal.tsx` currently offers *This
   Event* / *Entire Series*; add *This and following*. (Same dialog is the natural
   home for the delete path, which today reuses `editMode`.)
3. **Google push:** for `thisAndFollowing`, fetch the clicked occurrence's start,
   compute `UNTIL = start - 1s` (UTC, `YYYYMMDDTHHMMSSZ`), and `PATCH` the master
   event's `recurrence` to the truncated RRULE. Google removes the following
   occurrences.
4. **Local projection:** update the master row's `recurrenceRule`, soft-cancel
   local instances with `start >= cutoff`, and write `CalendarEventChange` rows —
   OR simply trigger one incremental sync and let the engine reconcile (slower but
   single source of truth). Recommended: do the optimistic local soft-cancel for
   snappy UX, then let the next sync confirm.

## What is FullCalendar vs our code (library boundary)

FullCalendar (`@fullcalendar/*`, v6) is used **purely for presentation** —
rendering events, views, drag/drop. This app **pre-expands** recurring series into
individual instance rows and feeds them to FullCalendar as plain events; it does
**not** use FullCalendar's `rrule` plugin. Therefore:

- All recurrence semantics — series delete, "this and following", exceptions,
  how far to expand — are **application + Google API** concerns, entirely outside
  FullCalendar.
- Implementing "this and following" needs **no FullCalendar extension and no
  fork.** The library never sees series logic.
- FullCalendar's own extensibility (event render hooks, `eventContent`, etc.) is
  already used for styling; nothing about the requested features requires more
  from it.

## Larger data-handling changes worth considering

Ordered roughly by value:

1. **Recurrence-exception fidelity.** We store instances and masters, but do we
   capture Google's per-instance overrides (moved time, edited title) as distinct
   from generated occurrences? Instances carry their own fields, so an edited
   occurrence's divergence is retained — but we don't currently flag
   `originalStartTime` / "this is an exception." Adding an `isException` +
   `originalStart` column would let the UI and any faithful re-export distinguish
   a true exception from a plain generated occurrence.

2. **Materialization strategy for open-ended series.** Storing ~730 rows per
   daily series is heavy and still has a horizon. Options: (a) keep the master +
   RRULE as source of truth and expand on read for far-future/far-past windows
   (less storage, more compute, and the archive's "every instance" promise
   weakens); (b) keep current expansion but add a scheduled re-backfill that rolls
   the horizon forward. Decision pending; document whichever we pick here.

3. **Token encryption at rest.** `ConnectedAccount.accessToken/refreshToken` are
   plaintext. For a sovereign homelab store this is acceptable but worth a
   column-level encryption pass if the DB ever leaves the box.

4. **Retention / compaction of the change log.** `CalendarEventChange` grows
   unbounded (5k+ rows already from backfill). Fine for now; eventually a
   compaction policy (e.g. keep all deletes, sample updates) or partition-by-month
   may be wanted. The NDJSON operational log is already prune-by-file.

5. **Cancelled-row growth.** Cancelled instances are kept forever by design. If
   the archive balloons, a "cold storage" flag or separate table for cancelled
   history could keep the hot `CalendarEvent` table lean while preserving the
   audit trail.

6. **Stats calendar filter** (see `TODO(stats-filter)` in `/api/stats`):
   subscribed calendars (holidays, school) skew the heatmap and year counts;
   default analytics to owned calendars.

## Timezone note

Stats extract hour/day/year using the user's `UserSettings.timeZone`
(reinterpreting naive-UTC timestamps). It follows whatever the user sets — no code
change needed when the user's zone changes.
