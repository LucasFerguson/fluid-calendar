# Agent Tools (OpenAPI tool server)

FluidCalendar exposes a small set of **agent tools** so an AI assistant (Open
WebUI, or anything that speaks the OpenAPI tool-server format) can read your
calendar/tasks and create new tasks and events on your behalf.

- **Base URL:** `https://<your-fluidcalendar-host>/api/mcp`
- **OpenAPI document:** `GET /api/mcp/openapi.json` (public — describes the
  tools only, no data)
- **Tool calls:** `POST /api/mcp/tools/<tool_name>` (require an API key)
- **Auth:** a FluidCalendar API key sent as `Authorization: Bearer fc_...`

> The tools all delegate to a single service layer (`src/services/*`) and the
> shared query builders, so archived/deleted (`status:"cancelled"`) events and
> disabled calendars are excluded consistently — the agent never sees them.

## Tools

| Tool | Scope | What it does |
|---|---|---|
| `list_calendar_events` | read | Events overlapping a `start`/`end` window (cancelled + disabled-calendar events excluded) |
| `list_calendars` | read | Your calendars, with `enabled` and `canWrite` flags |
| `list_tasks` | read | Your tasks, optionally filtered by status/search |
| `get_stats` | read | Archive counters (events, deletions preserved, audit entries, calendars, contacts) |
| `create_task` | write | Create a task (only `title` required) |
| `create_calendar_event` | write | Create an event on a writable Google calendar |

Editing and deleting events are intentionally **not** exposed yet.

## Connecting Open WebUI

1. In FluidCalendar, go to **Settings → API Keys** and create a key.
   - Give it **read + write** scope if you want the assistant to create tasks
     and events; **read** scope if you only want it to read.
   - Copy the `fc_...` value now — it is shown only once.
2. In Open WebUI, open **Settings → Tools** (or **Admin Panel → Settings →
   Tools**) → **Add Tool Server / Connection**, and enter:

   | Field | Value |
   |---|---|
   | **Name** | `FluidCalendar` |
   | **Description** | `Read my calendar, tasks, and archive stats; create tasks and events.` |
   | **URL** | `https://<your-fluidcalendar-host>/api/mcp` |
   | **API Key** | your `fc_...` key |

   Open WebUI fetches `<URL>/openapi.json` and registers each tool. If your host
   is reached directly rather than via a domain, use `http://<host>:3000/api/mcp`.

## Security notes

- The API key is the whole security boundary — treat a read+write key like a
  password. Prefer a **read-only** key unless you want create access.
- Every tool call is scoped to the key's user and logged.
- Write tools (`create_*`) are refused for read-only keys.
