import { toCsv } from "@/components/contacts/csv";
import { ContactSummary } from "@/components/contacts/types";

function contact(over: Partial<ContactSummary>): ContactSummary {
  return {
    email: "a@b.com",
    name: null,
    meetings: 0,
    firstMet: null,
    lastMeeting: null,
    nextMeeting: null,
    company: null,
    title: null,
    photoUrl: null,
    ...over,
  };
}

describe("contacts CSV export", () => {
  it("emits a header row mirroring the table columns (no id)", () => {
    const csv = toCsv([]);
    const header = csv.replace(/^﻿/, "").split("\r\n")[0];
    expect(header).toBe(
      "Name,Email,Company,Title,First met,Last meeting,Next meeting,Meetings"
    );
    expect(header.toLowerCase()).not.toContain("id");
  });

  it("outputs dates as YYYY-MM-DD and blanks for nulls", () => {
    const csv = toCsv([
      contact({
        name: "Tony Ferguson",
        email: "ferguson.tony@gmail.com",
        company: "Ames Construction",
        title: "Ops Lead",
        firstMet: "2026-06-25T15:00:00",
        lastMeeting: "2026-07-12T22:00:00",
        nextMeeting: null,
        meetings: 4,
      }),
    ]);
    const row = csv.replace(/^﻿/, "").split("\r\n")[1];
    expect(row).toBe(
      "Tony Ferguson,ferguson.tony@gmail.com,Ames Construction,Ops Lead,2026-06-25,2026-07-12,,4"
    );
  });

  it("quotes fields containing commas or quotes", () => {
    const csv = toCsv([
      contact({ name: "Cuevas, Cesar", company: 'Big "Co"', email: "c@x.com" }),
    ]);
    const row = csv.replace(/^﻿/, "").split("\r\n")[1];
    expect(row).toContain('"Cuevas, Cesar"');
    expect(row).toContain('"Big ""Co"""');
  });

  it("prepends a UTF-8 BOM for spreadsheet apps", () => {
    expect(toCsv([]).charCodeAt(0)).toBe(0xfeff);
  });
});
