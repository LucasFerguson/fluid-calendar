import { calendar_v3 } from "googleapis";

import { deleteGoogleEvent } from "@/lib/google-calendar";

type Calendar = calendar_v3.Calendar;

/**
 * Builds a fake Google Calendar client whose `events.get` returns the supplied
 * event data, and whose `delete`/`instances` are jest mocks we can assert on.
 */
function makeFakeCalendar(getData: calendar_v3.Schema$Event) {
  const get = jest.fn().mockResolvedValue({ data: getData });
  const del = jest.fn().mockResolvedValue({ data: {} });
  const instances = jest
    .fn()
    .mockResolvedValue({ data: { items: [{ id: "WRONG_NEXT_INSTANCE" }] } });

  const calendar = {
    events: { get, delete: del, instances },
  } as unknown as Calendar;

  return { calendar, get, del, instances };
}

describe("deleteGoogleEvent - single occurrence targets the clicked instance", () => {
  const accountId = "acc";
  const userId = "user";
  const calendarId = "cal";

  it("single mode deletes the provided (clicked) recurring instance id, not the next upcoming one", async () => {
    const clickedId = "master123_20260601T090000Z";
    const { calendar, del, instances } = makeFakeCalendar({
      id: clickedId,
      recurringEventId: "master123",
    });

    await deleteGoogleEvent(
      accountId,
      userId,
      calendarId,
      clickedId,
      "single",
      async () => calendar
    );

    // It must delete exactly the clicked instance id...
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith({ calendarId, eventId: clickedId });
    // ...and must NOT re-query for the "next upcoming" instance.
    expect(instances).not.toHaveBeenCalled();
  });

  it("single mode does not delete a future occurrence when a past one is clicked", async () => {
    const clickedPastId = "master123_20250101T090000Z";
    const { calendar, del } = makeFakeCalendar({
      id: clickedPastId,
      recurringEventId: "master123",
    });

    await deleteGoogleEvent(
      accountId,
      userId,
      calendarId,
      clickedPastId,
      "single",
      async () => calendar
    );

    expect(del).toHaveBeenCalledWith({ calendarId, eventId: clickedPastId });
    expect(del).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "WRONG_NEXT_INSTANCE" })
    );
  });

  it("single mode deletes a non-recurring event id directly without an instances lookup", async () => {
    const eventId = "plain-block-event";
    const { calendar, del, instances } = makeFakeCalendar({ id: eventId });

    await deleteGoogleEvent(
      accountId,
      userId,
      calendarId,
      eventId,
      "single",
      async () => calendar
    );

    expect(del).toHaveBeenCalledWith({ calendarId, eventId });
    expect(instances).not.toHaveBeenCalled();
  });

  it("single mode refuses to delete a recurring master id (would erase the whole series)", async () => {
    // A true master: has recurrence, but no recurringEventId.
    const masterId = "master123";
    const { calendar, del } = makeFakeCalendar({
      id: masterId,
      recurrence: ["RRULE:FREQ=WEEKLY"],
    });

    await expect(
      deleteGoogleEvent(
        accountId,
        userId,
        calendarId,
        masterId,
        "single",
        async () => calendar
      )
    ).rejects.toThrow();

    // Must NOT delete the master id in single mode.
    expect(del).not.toHaveBeenCalled();
  });

  it("an invalid/unknown mode does not bypass the master guard (no series wipe)", async () => {
    // The DELETE route forwards `mode` from request JSON untyped, so a malformed
    // request could send something that is neither "single" nor "series".
    const masterId = "master123";
    const { calendar, del } = makeFakeCalendar({
      id: masterId,
      recurrence: ["RRULE:FREQ=WEEKLY"],
    });

    await expect(
      deleteGoogleEvent(
        accountId,
        userId,
        calendarId,
        masterId,
        // Simulate an invalid mode coming off the wire.
        "this" as unknown as "single" | "series",
        async () => calendar
      )
    ).rejects.toThrow();

    expect(del).not.toHaveBeenCalled();
  });

  it("series mode deletes the master recurring event", async () => {
    const clickedId = "master123_20260601T090000Z";
    const { calendar, del } = makeFakeCalendar({
      id: clickedId,
      recurringEventId: "master123",
    });

    await deleteGoogleEvent(
      accountId,
      userId,
      calendarId,
      clickedId,
      "series",
      async () => calendar
    );

    expect(del).toHaveBeenCalledWith({ calendarId, eventId: "master123" });
  });
});

/**
 * Builds a fake whose events.get resolves different data per eventId (so the
 * instance and the master can differ) and exposes a patch mock.
 */
function makeSeriesCalendar(byId: Record<string, calendar_v3.Schema$Event>) {
  const get = jest.fn(({ eventId }: { eventId: string }) =>
    Promise.resolve({ data: byId[eventId] ?? {} })
  );
  const del = jest.fn().mockResolvedValue({ data: {} });
  const patch = jest.fn().mockResolvedValue({ data: {} });
  const calendar = {
    events: { get, delete: del, patch },
  } as unknown as Calendar;
  return { calendar, get, del, patch };
}

describe("deleteGoogleEvent - thisAndFollowing truncates the series", () => {
  const accountId = "acc";
  const userId = "user";
  const calendarId = "cal";

  it("truncates the master RRULE with UNTIL just before the clicked occurrence", async () => {
    const clickedId = "master123_20260601T090000Z";
    const { calendar, patch, del } = makeSeriesCalendar({
      [clickedId]: {
        id: clickedId,
        recurringEventId: "master123",
        start: { dateTime: "2026-06-01T09:00:00Z" },
      },
      master123: {
        id: "master123",
        recurrence: ["RRULE:FREQ=DAILY"],
        start: { dateTime: "2026-01-01T09:00:00Z" },
      },
    });

    await deleteGoogleEvent(
      accountId,
      userId,
      calendarId,
      clickedId,
      "thisAndFollowing",
      async () => calendar
    );

    // Patches the MASTER, not deletes anything, with UNTIL one second before
    // the clicked occurrence (2026-06-01T09:00:00Z -> ...085959Z).
    expect(del).not.toHaveBeenCalled();
    expect(patch).toHaveBeenCalledWith({
      calendarId,
      eventId: "master123",
      requestBody: { recurrence: ["RRULE:FREQ=DAILY;UNTIL=20260601T085959Z"] },
    });
  });

  it("strips an existing UNTIL/COUNT before appending the new bound", async () => {
    const clickedId = "m_20260601T090000Z";
    const { calendar, patch } = makeSeriesCalendar({
      [clickedId]: {
        id: clickedId,
        recurringEventId: "m",
        start: { dateTime: "2026-06-01T09:00:00Z" },
      },
      m: {
        id: "m",
        recurrence: ["RRULE:FREQ=WEEKLY;COUNT=100;BYDAY=MO"],
        start: { dateTime: "2026-01-05T09:00:00Z" },
      },
    });

    await deleteGoogleEvent(
      accountId,
      userId,
      calendarId,
      clickedId,
      "thisAndFollowing",
      async () => calendar
    );

    expect(patch).toHaveBeenCalledWith({
      calendarId,
      eventId: "m",
      requestBody: {
        recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260601T085959Z"],
      },
    });
  });

  it("deletes the whole series when the clicked occurrence is the first one", async () => {
    const clickedId = "master123_20260101T090000Z";
    const { calendar, patch, del } = makeSeriesCalendar({
      [clickedId]: {
        id: clickedId,
        recurringEventId: "master123",
        start: { dateTime: "2026-01-01T09:00:00Z" },
      },
      master123: {
        id: "master123",
        recurrence: ["RRULE:FREQ=DAILY"],
        start: { dateTime: "2026-01-01T09:00:00Z" },
      },
    });

    await deleteGoogleEvent(
      accountId,
      userId,
      calendarId,
      clickedId,
      "thisAndFollowing",
      async () => calendar
    );

    // Cutoff falls at/before the series start, so nothing would remain -> the
    // whole series is deleted instead of leaving an empty rule.
    expect(patch).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith({ calendarId, eventId: "master123" });
  });
});
