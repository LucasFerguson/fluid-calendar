import { newDate } from "@/lib/date-utils";

// The API sends wall-clock ISO strings in the user's timezone with no zone
// suffix; parsing them as-is and formatting the calendar-date parts shows the
// intended wall time regardless of the browser's own timezone.

export function formatDay(local: string | null): string {
  if (!local) return "—";
  const d = newDate(local);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

export function formatDayTime(local: string, allDay: boolean): string {
  const d = newDate(local);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(allDay ? {} : { hour: "numeric", minute: "2-digit" }),
  }).format(d);
}

/** Initials for the avatar circle: "Tony Ferguson" -> "TF", else from email. */
export function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const words = source.split(/[\s._@-]+/).filter(Boolean);
  const chars = words.slice(0, 2).map((w) => w[0]);
  return chars.join("").toUpperCase() || "?";
}
