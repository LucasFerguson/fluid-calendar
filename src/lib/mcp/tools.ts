import { z } from "zod";

import {
  createEvent,
  listCalendars,
  listEvents,
} from "@/services/calendar-events-service";
import { getArchiveStats } from "@/services/stats-service";
import { createTask, listTasks } from "@/services/tasks-service";

// Declarative agent-tool registry. Each tool is transport-agnostic: an OpenAPI
// tool server (for Open WebUI) is generated from this list, and the same defs
// can back an MCP server. Handlers delegate to the service layer — no direct DB
// access here.

export type ToolScope = "read" | "write";

export interface ToolContext {
  userId: string;
  canWrite: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ToolDefinition<S extends z.ZodType = z.ZodType<any>> {
  name: string;
  title: string;
  description: string;
  scope: ToolScope;
  input: S;
  handler: (ctx: ToolContext, args: z.infer<S>) => Promise<unknown>;
}

const isoDate = (what: string) =>
  z
    .string()
    .describe(`${what} as an ISO 8601 datetime, e.g. "2026-07-21T09:00:00Z"`);

// Helper so each entry keeps its own precise input type while the array stays
// heterogeneous.
function tool<S extends z.ZodType>(def: ToolDefinition<S>): ToolDefinition {
  return def as unknown as ToolDefinition;
}

export const TOOLS: ToolDefinition[] = [
  tool({
    name: "list_calendar_events",
    title: "List calendar events",
    description:
      "List the user's calendar events that overlap a time window. Excludes deleted/archived events and events on disabled calendars. Use this to understand what is on the user's schedule.",
    scope: "read",
    input: z.object({
      start: isoDate("Window start (inclusive)"),
      end: isoDate("Window end (inclusive)"),
      feedIds: z
        .array(z.string())
        .optional()
        .describe("Optional list of calendar ids to restrict to"),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Max events to return (default 250)"),
    }),
    handler: (ctx, args) => listEvents({ userId: ctx.userId, ...args }),
  }),

  tool({
    name: "list_calendars",
    title: "List calendars",
    description:
      "List the user's calendars (feeds), including whether each is enabled and whether new events can be created on it (canWrite).",
    scope: "read",
    input: z.object({}),
    handler: (ctx) => listCalendars(ctx.userId),
  }),

  tool({
    name: "list_tasks",
    title: "List tasks",
    description:
      "List the user's tasks, optionally filtered by status or a text search. Returns due dates and auto-scheduled times when present.",
    scope: "read",
    input: z.object({
      status: z
        .array(z.enum(["todo", "in_progress", "completed"]))
        .optional()
        .describe("Filter to these statuses"),
      search: z
        .string()
        .optional()
        .describe("Case-insensitive text match on title/description"),
      limit: z.number().int().positive().optional(),
    }),
    handler: (ctx, args) => listTasks({ userId: ctx.userId, ...args }),
  }),

  tool({
    name: "get_stats",
    title: "Get archive stats",
    description:
      "Get high-level counters about the user's calendar archive: events archived, deletions preserved, audit entries, number of calendars, and distinct contacts.",
    scope: "read",
    input: z.object({}),
    handler: (ctx) => getArchiveStats(ctx.userId),
  }),

  tool({
    name: "create_task",
    title: "Create task",
    description:
      "Create a new task for the user. Only the title is required. Does not auto-schedule; the user can auto-schedule it later.",
    scope: "write",
    input: z.object({
      title: z.string().min(1).describe("Task title"),
      description: z.string().optional(),
      status: z
        .enum(["todo", "in_progress", "completed"])
        .optional()
        .describe("Defaults to 'todo'"),
      priority: z
        .string()
        .optional()
        .describe("e.g. 'high', 'medium', 'low'"),
      energyLevel: z
        .string()
        .optional()
        .describe("e.g. 'high', 'medium', 'low'"),
      dueDate: z
        .string()
        .optional()
        .describe("Optional ISO 8601 due date"),
      duration: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Estimated duration in minutes"),
    }),
    handler: (ctx, args) => createTask({ userId: ctx.userId, ...args }),
  }),

  tool({
    name: "create_calendar_event",
    title: "Create calendar event",
    description:
      "Create a new event on one of the user's writable Google calendars. Call list_calendars first to find a calendar where canWrite is true and use its id as feedId. Cannot edit or delete existing events.",
    scope: "write",
    input: z.object({
      feedId: z
        .string()
        .describe("Id of a writable calendar (canWrite true from list_calendars)"),
      title: z.string().min(1),
      start: isoDate("Event start"),
      end: isoDate("Event end"),
      description: z.string().optional(),
      location: z.string().optional(),
      allDay: z.boolean().optional().describe("Defaults to false"),
    }),
    handler: (ctx, args) => createEvent({ userId: ctx.userId, ...args }),
  }),
];

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}
