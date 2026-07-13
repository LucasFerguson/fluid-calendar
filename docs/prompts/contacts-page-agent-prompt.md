# Agent prompt: build a Contacts page from calendar attendees

Copy everything below the line into a fresh agent session.

---

You are working in `/root/fluid-calendar`, a self-hosted fork of FluidCalendar
(a Next.js 15 / React 19 / TypeScript / Prisma + Postgres calendar app) that has
been turned into a **full-archival Google Calendar mirror**. Read `CLAUDE.md`
first for conventions, then `docs/archival-sync-design.md` and `docs/ROADMAP.md`
for context. This task is the "People / Contacts" idea from the roadmap.

## What to build

A new top-level **Contacts** page (a 4th-style nav item next to Calendar, Tasks,
Focus, Statistics — use a people/address-book icon from `react-icons`). It shows
a **table of every person found across my calendar events**, derived from the
`EventAttendee` table. Columns:

- **Contact** — display name, with email underneath (fall back to email if no
  name).
- **First met** — the date of the earliest event I share with this contact.
- **Last meeting** — the date of the most recent *past* event we share.
- **Next meeting** — the date of the soonest *future* event we share; **blank if
  none**.
- (Nice to have) a meeting count.

**Clicking a contact** opens an additional detail view (a side drawer, expandable
row, or modal — your call, match the app's existing UI) that shows the **titles**
of those three meetings (first, last, next) alongside their dates, and ideally a
short list of all shared events.

## Data model (already exists — do not recreate)

`EventAttendee` (see `prisma/schema.prisma`): one row per invited person/resource
per event. Fields: `id`, `eventId` (→ `CalendarEvent.id`, cascade), `email`,
`name`, `responseStatus`, `optional`, `isOrganizer`, `isSelf`, `isResource`,
`comment`, `additionalGuests`, `createdAt`. It's populated on every sync of an
event that carries attendees (see `src/lib/calendar-attendees.ts`).

Join to `CalendarEvent` (has `start`, `end`, `title`, `status`, `feedId`) and
`CalendarFeed` (has `userId`) to scope to the current user.

Important filters:
- **Exclude cancelled events**: `status IS NULL OR status <> 'cancelled'`
  (deletions are archived, not removed).
- **Exclude `isSelf = true`** and the user's own email — you are not your own
  contact. (Get the user's email from their `User`/account if needed.)
- Decide how to treat `isResource = true` (rooms/equipment) — probably exclude,
  or show in a separate group.

## Suggested implementation

1. **Aggregation API** — add `src/app/api/contacts/route.ts`. Copy the shape of
   `src/app/api/stats/route.ts`: authenticate with `authenticateRequest` from
   `@/lib/auth/api-auth`, read the user's timezone from `UserSettings`, and do
   the heavy work in Postgres with `prisma.$queryRaw` (no per-event rows over the
   wire). Sketch for the list:

   ```sql
   SELECT a.email,
          max(a.name)                                        AS name,
          count(*)::int                                      AS meetings,
          min(e.start)                                       AS first_start,
          max(e.start) FILTER (WHERE e.start <= now())       AS last_past_start,
          min(e.start) FILTER (WHERE e.start >  now())       AS next_start
   FROM "EventAttendee" a
   JOIN "CalendarEvent" e ON e.id = a."eventId"
   JOIN "CalendarFeed"  f ON f.id = e."feedId"
   WHERE f."userId" = ${userId}
     AND (e.status IS NULL OR e.status <> 'cancelled')
     AND a."isSelf" = false
     AND a.email IS NOT NULL
   GROUP BY a.email
   ORDER BY last_past_start DESC NULLS LAST
   ```

   To get the **titles** of the first/last/next meetings, either add correlated
   `LATERAL` subqueries, or (simpler) return the list first and add a second
   endpoint `GET /api/contacts/[email]` that returns that contact's shared events
   (id, title, start) ordered by start — the detail view fetches it on click.
   That keeps the list query cheap and the detail lazy.

2. **Nav item** — add to the `links` array in
   `src/components/navigation/AppNav.tsx` (e.g. `{ href: "/contacts", label:
   "Contacts", icon: BsPeople }`).

3. **Page** — `src/app/(common)/contacts/page.tsx` (a thin client page like
   `src/app/(common)/stats/page.tsx`) rendering a `ContactsTable` component in
   `src/components/contacts/`. Use **TanStack Query** (`useQuery`) — the root
   layout already wraps everything in the provider. Follow the `src/components/
   stats/` components for structure, theming tokens, and formatting helpers.

4. **Detail view** — on row click, fetch `/api/contacts/[email]` and show the
   three named meetings + a list of shared events.

## Conventions to follow (from CLAUDE.md)

- Import the singleton `prisma` from `@/lib/prisma`; never `new PrismaClient()`.
- Use date helpers from `@/lib/date-utils`, not `date-fns` directly.
- Use the `logger` from `@/lib/logger` (define a `LOG_SOURCE`), never
  `console.log`.
- Next 15 route handlers: `params` is a Promise — `const { email } = await
  params`.
- shadcn/ui components + Tailwind theme tokens (`text-muted-foreground`,
  `bg-card`, `border`, etc.) so light/dark both work. For any colored marks,
  reuse `getEventColors`/`readableTextColor` from `@/lib/calendar-colors`.
- Escape JSX quotes/apostrophes as `&apos;`/`&quot;`.
- Update `CHANGELOG.md` under `[Unreleased]`, and mark the People item done in
  `docs/ROADMAP.md`.
- Commit in logical units on `main` with conventional-commit messages and the
  `Co-Authored-By: Claude ...` trailer (this is a personal fork, no PR flow).

## Gotchas / warnings

- **Timezone**: event `start` is stored as naive UTC. For any date grouping/
  display, reinterpret in the user's timezone like the stats API does:
  `(e.start AT TIME ZONE 'UTC') AT TIME ZONE ${tz}`.
- **Emails may repeat with different display names** over time; `max(a.name)` is
  a simple pick — consider "most recent non-null name" if you want nicer output.
- The `EventAttendee` table only has rows for events **synced since the table was
  added**. The main Google account may not be connected yet; if the table is
  sparse, that's expected — it fills as events sync. (A one-time backfill from
  the `CalendarEvent.attendees` JSON / `CalendarEventChange.changeData` is a
  listed roadmap item if you want history immediately — see
  `TODO(attendee-backfill)` in `src/lib/calendar-attendees.ts`.)
- Watch out for a known bug class: routes that **delete-then-recreate** local
  rows break under this fork's soft-cancel + `(feedId, externalEventId)` unique
  constraint. You won't hit it for a read-only Contacts feature, but keep it in
  mind if you touch write paths.

## Build / verify / deploy workflow

- The app runs as a **systemd service** on port 3000: `fluid-calendar-archive.service`.
- Typecheck/lint/build must be clean: `npx tsc --noEmit`, `npx next lint
  --max-warnings=0`, `npm run build`. Then `systemctl restart
  fluid-calendar-archive.service` and `curl -s -o /dev/null -w "%{http_code}"
  http://localhost:3000/` (expect 200).
- The database is **`fluidcal`** (Postgres, local). Connection string is in
  `/root/fluid-calendar/.env` (`DATABASE_URL`). This is a **test/throwaway
  calendar** (a low-value Google account), so it's safe to inspect, and the owner
  is fine with you nuking/adjusting rows while iterating — just don't touch the
  old `/opt/fluid-calendar` instance or its `fluiddb` database.
- Auth is session (browser) **or** API key. To test an endpoint from curl,
  create a key in **Settings → API Keys** and send `Authorization: Bearer fc_...`
  (see `docs/API.md`).
- To seed attendee data for testing (the test calendar has no guests): add a
  guest to an event in Google Calendar for the connected account and let the
  incremental sync pick it up, or insert a couple of `EventAttendee` rows tied to
  existing `CalendarEvent` ids directly in Postgres and build against those.

## What the previous agent (me) already did

Over a long session this fork gained: the full-archival Google sync engine
(`src/lib/google-calendar-sync/`), a Statistics dashboard (`/stats`) with a live
sync panel, recurring "delete this and following", per-calendar color/opacity +
auto-contrast text, a rolling-horizon refresh for open-ended series, **API keys**
(`ApiKey` model + `docs/API.md`), and the **`EventAttendee` table + enrichment**
that this Contacts page is meant to consume. The `enrichAttendees` mapping is
unit-tested in `src/__tests__/calendar-attendees.test.ts`. Full history is in
`git log`, and the design/roadmap live in `docs/`. Build on the `src/components/
stats/` patterns — they're the closest precedent for what you're building.
