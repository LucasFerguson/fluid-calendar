# FluidCalendar API

A REST API over your local calendar archive and tasks, for integrating other
homelab applications. All data is served from FluidCalendar's own Postgres
database (the local mirror of your Google/Outlook/CalDAV calendars), so reads
never hit the upstream providers.

## Authentication

Two methods are accepted on every `/api/*` route:

1. **API key** (for machine clients). Create one in **Settings → API Keys**. The
   raw key is shown once; only a SHA-256 hash is stored. Present it as either:
   - `Authorization: Bearer fc_xxxx…`
   - `X-API-Key: fc_xxxx…`
2. **Browser session** (NextAuth cookie) — used automatically by the web UI.

### Scopes

- `read` — the key may only make `GET` requests. Any `POST/PUT/PATCH/DELETE`
  returns `403`.
- `read,write` — full access, same as the owning user.

A key acts as its owning user; it sees exactly that user's calendars and tasks.

### Example

```bash
curl -s https://your-host/api/events \
  -H "Authorization: Bearer fc_your_key_here" | jq '.[0]'
```

## Conventions

- Base path: `/api`
- JSON request and response bodies.
- Auth failures: `401` (no/invalid key), `403` (read-only key on a mutation).
- Timestamps are ISO 8601. Event `start`/`end` are absolute instants; the
  original provider timezone is in `timeZone` when known.

## Endpoints

### Calendar events

| Method | Path | Notes |
|---|---|---|
| GET | `/api/events` | All events across the user's calendars. Excludes provider-cancelled events. |
| GET | `/api/events/:id` | A single event. |
| POST | `/api/events` | Create a local event. (write) |
| PUT | `/api/events/:id` | Update an event. (write) |
| DELETE | `/api/events/:id` | Delete an event. (write) |

Google-specific create/update/delete (which round-trip to Google) live under
`/api/calendar/google/events` and accept a `mode` of `single`, `series`, or
`thisAndFollowing` for recurring events.

An event object includes: `id`, `feedId`, `externalEventId`, `title`,
`description`, `start`, `end`, `location`, `timeZone`, `allDay`, `status`,
`isRecurring`, `recurrenceRule`, `isMaster`, `masterEventId`, `recurringEventId`,
`created`, `lastModified`, `organizer`, `attendees`.

### Calendars (feeds)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/feeds` | All calendar feeds (color, opacity, enabled, sync state). |
| PATCH | `/api/feeds/:id` | Update local feed props (e.g. `color`, `opacity`, `enabled`). (write) |

### Tasks & projects

| Method | Path | Notes |
|---|---|---|
| GET | `/api/tasks` | All tasks. |
| POST | `/api/tasks` | Create a task. (write) |
| GET/PUT/DELETE | `/api/tasks/:id` | Read/update/delete a task. |
| GET | `/api/projects` | All projects. |
| GET | `/api/export/tasks` | Export tasks. |

### Statistics (archive analytics)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/stats` | Totals, per-year, per-calendar, and a 7×24 weekday/hour heatmap (computed in the user's timezone). |
| GET | `/api/stats/live` | Cheap, pollable: per-feed sync state, recent change-log activity, and the live sync-engine progress (`phase`, `page`, `nextTickAt`). |
| GET | `/api/contacts` | Every person you've shared an event with (from `EventAttendee`): name, meeting count, first met / last meeting / next meeting dates in the user's timezone. |
| GET | `/api/contacts/:email` | One contact's shared events (title, start, calendar, RSVP), oldest first. |

The archival change log (`CalendarEventChange`) records every observed
create/update/cancellation; a read endpoint for it is a natural addition if you
want to consume the audit trail directly (not yet exposed).

## Notes on writes

- Deleting a Google event soft-cancels locally (the archive never loses
  history) and pushes the delete to Google.
- Write-back currently supports Google events (create/update/delete, including
  recurring `thisAndFollowing` truncation). Outlook/CalDAV write paths exist for
  their own routes.

## Not (yet) provided

- **No CalDAV *server*.** FluidCalendar is a CalDAV *client*; it does not expose
  a CalDAV endpoint other apps can subscribe to. Consume the REST API above
  instead. (A read-only CalDAV/iCal export feed is a possible future addition.)
- **No per-endpoint rate limiting** on API keys yet — intended for a trusted
  homelab, not public exposure.
