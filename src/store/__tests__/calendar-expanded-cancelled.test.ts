import { newDate } from "@/lib/date-utils";

import { useCalendarStore } from "@/store/calendar";

import { CalendarEvent } from "@/types/calendar";

// These lock the defense-in-depth guard in getExpandedEvents: even if a fetch
// path ever puts an archived row into the store, the single render choke point
// (getExpandedEvents, feeding all four views via getAllCalendarItems) must never
// surface a status:"cancelled" event — while keeping NULL-status local/manual
// events visible. The server-side includeCancelled=false filter is the primary
// defense; this is the belt-and-braces one.

const WINDOW_START = newDate("2026-07-01T00:00:00.000Z");
const WINDOW_END = newDate("2026-07-31T23:59:59.999Z");

// A time inside the window.
const IN_START = newDate("2026-07-10T09:00:00.000Z");
const IN_END = newDate("2026-07-10T10:00:00.000Z");

// The DB/sync store the provider's lowercase status literal ("cancelled",
// "confirmed"), which is what the guard and the query-layer filters compare
// against — even though the declared EventStatus enum is uppercase. Accept a
// loose string here so fixtures mirror real data.
type EventOverrides = Partial<Omit<CalendarEvent, "status">> & {
  status?: string;
};

function makeEvent(overrides: EventOverrides): CalendarEvent {
  return {
    id: "evt",
    feedId: "feed-1",
    title: "Event",
    start: IN_START,
    end: IN_END,
    isRecurring: false,
    allDay: false,
    isMaster: false,
    ...overrides,
  } as CalendarEvent;
}

function setEvents(events: CalendarEvent[]) {
  useCalendarStore.setState({ events });
}

function expandedIds(): string[] {
  return useCalendarStore
    .getState()
    .getExpandedEvents(WINDOW_START, WINDOW_END)
    .map((e) => e.id);
}

function allItemIds(): string[] {
  // getTasksAsEvents reads the (empty) task store, so this is just the events.
  return useCalendarStore
    .getState()
    .getAllCalendarItems(WINDOW_START, WINDOW_END)
    .map((e) => e.id);
}

afterEach(() => {
  setEvents([]);
});

describe("getExpandedEvents cancelled/archived guard", () => {
  it("excludes a cancelled single event", () => {
    setEvents([makeEvent({ id: "cancelled-single", status: "cancelled" })]);
    expect(expandedIds()).not.toContain("cancelled-single");
    expect(expandedIds()).toHaveLength(0);
  });

  it("excludes a cancelled recurring instance row (isMaster:false + masterEventId)", () => {
    setEvents([
      makeEvent({
        id: "cancelled-instance",
        status: "cancelled",
        isRecurring: true,
        isMaster: false,
        masterEventId: "master-1",
      }),
    ]);
    expect(expandedIds()).not.toContain("cancelled-instance");
    expect(expandedIds()).toHaveLength(0);
  });

  it("keeps a NULL-status event (local/manual events must stay visible)", () => {
    // status omitted === NULL from the DB projection.
    setEvents([makeEvent({ id: "null-status" })]);
    expect(expandedIds()).toContain("null-status");
  });

  it("keeps a confirmed instance (the guard is not over-broad)", () => {
    setEvents([
      makeEvent({
        id: "confirmed-instance",
        status: "confirmed",
        isRecurring: true,
        isMaster: false,
        masterEventId: "master-1",
      }),
    ]);
    expect(expandedIds()).toContain("confirmed-instance");
  });

  it("surfaces the guard through getAllCalendarItems too", () => {
    setEvents([
      makeEvent({ id: "cancelled-single", status: "cancelled" }),
      makeEvent({ id: "live", status: "confirmed" }),
    ]);
    expect(allItemIds()).toEqual(["live"]);
  });
});

describe("thisAndFollowing cancellation is not re-materialized", () => {
  it("returns neither the cancelled following instances nor re-generated occurrences", () => {
    // Simulates the state right after a thisAndFollowing soft-cancel: the
    // following occurrences exist only as cancelled instance rows, while the
    // master still carries its FULL RRULE (calendar-db defers the RRULE
    // truncation to the next sync). The render path must show none of them.
    const master = makeEvent({
      id: "master-1",
      title: "Daily standup",
      isRecurring: true,
      isMaster: true,
      recurrenceRule: "RRULE:FREQ=DAILY",
      start: newDate("2026-07-05T09:00:00.000Z"),
      end: newDate("2026-07-05T09:30:00.000Z"),
    });
    const cancelledFollowing = [
      "2026-07-20T09:00:00.000Z",
      "2026-07-21T09:00:00.000Z",
      "2026-07-22T09:00:00.000Z",
    ].map((iso) =>
      makeEvent({
        id: `master-1_${iso}`,
        status: "cancelled",
        isRecurring: true,
        isMaster: false,
        masterEventId: "master-1",
        start: newDate(iso),
        end: newDate(new Date(iso).getTime() + 30 * 60000),
      })
    );

    setEvents([master, ...cancelledFollowing]);

    const ids = expandedIds();
    // No cancelled instance leaks.
    for (const c of cancelledFollowing) {
      expect(ids).not.toContain(c.id);
    }
    // The master is never client-expanded in the render path (expandInstances
    // defaults to false), so no occurrence rows are re-generated from its RRULE.
    expect(ids).toHaveLength(0);
    expect(allItemIds()).toHaveLength(0);
  });
});
