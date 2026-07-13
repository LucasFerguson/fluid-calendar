// Date-ish strings below are wall-clock ISO in the user's timezone with no
// zone suffix ("2026-07-12T17:30:00"); render them as-is, don't convert.

export interface ContactSummary {
  email: string;
  name: string | null;
  meetings: number;
  firstMet: string | null;
  lastMeeting: string | null;
  nextMeeting: string | null;
}

export interface ContactsResponse {
  timeZone: string;
  contacts: ContactSummary[];
}

export interface ContactEvent {
  id: string;
  title: string | null;
  start: string;
  allDay: boolean;
  isPast: boolean;
  responseStatus: string | null;
  calendarName: string;
  calendarColor: string | null;
}

export interface ContactDetailResponse {
  timeZone: string;
  email: string;
  name: string | null;
  events: ContactEvent[];
}
