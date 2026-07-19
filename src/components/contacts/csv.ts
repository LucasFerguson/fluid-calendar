import { ContactSummary } from "./types";

// CSV export of the contacts list, mirroring the visible table columns (no
// internal id). Kept free of React imports so it can be unit-tested directly.

function csvField(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// Dates are emitted as plain YYYY-MM-DD for easy downstream processing.
export function toCsv(rows: ContactSummary[]): string {
  const header = [
    "Name",
    "Email",
    "Company",
    "Title",
    "First met",
    "Last meeting",
    "Next meeting",
    "Meetings",
  ];
  const body = rows.map((c) =>
    [
      c.name ?? "",
      c.email,
      c.company ?? "",
      c.title ?? "",
      c.firstMet?.slice(0, 10) ?? "",
      c.lastMeeting?.slice(0, 10) ?? "",
      c.nextMeeting?.slice(0, 10) ?? "",
      String(c.meetings),
    ]
      .map(csvField)
      .join(",")
  );
  // Prepend a BOM so Excel opens the UTF-8 file with the right encoding.
  return "﻿" + [header.join(","), ...body].join("\r\n");
}
