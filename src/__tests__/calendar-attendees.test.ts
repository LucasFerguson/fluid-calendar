import { calendar_v3 } from "googleapis";

import { enrichAttendees } from "@/lib/calendar-attendees";

describe("enrichAttendees", () => {
  it("returns undefined when the provider omits attendees", () => {
    expect(enrichAttendees(undefined)).toBeUndefined();
    expect(enrichAttendees(null)).toBeUndefined();
  });

  it("maps and enriches every provider field", () => {
    const input: calendar_v3.Schema$EventAttendee[] = [
      {
        email: "alice@example.com",
        displayName: "Alice",
        responseStatus: "accepted",
        optional: true,
        comment: "running late",
        additionalGuests: 2,
      },
      {
        email: "room-a@resource.calendar.google.com",
        displayName: "Room A",
        resource: true,
        organizer: false,
        self: false,
      },
    ];

    expect(enrichAttendees(input)).toEqual([
      {
        name: "Alice",
        email: "alice@example.com",
        status: "accepted",
        optional: true,
        organizer: false,
        self: false,
        resource: false,
        comment: "running late",
        additionalGuests: 2,
      },
      {
        name: "Room A",
        email: "room-a@resource.calendar.google.com",
        status: null,
        optional: false,
        organizer: false,
        self: false,
        resource: true,
        comment: null,
        additionalGuests: null,
      },
    ]);
  });

  it("defaults the boolean flags to false when absent", () => {
    const [a] = enrichAttendees([{ email: "b@example.com" }])!;
    expect(a).toMatchObject({
      optional: false,
      organizer: false,
      self: false,
      resource: false,
    });
  });
});
