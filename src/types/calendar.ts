export interface CalendarFeed {
  id: string;
  name: string;
  url?: string; // Make optional since local calendar won't have URL
  type: "GOOGLE" | "OUTLOOK" | "CALDAV";
  color?: string;
  opacity?: number | null; // Event background opacity 0..1
  enabled: boolean;
  lastSync?: Date;
  error?: string;
  caldavPath?: string;
  accountId?: string;
  syncToken?: string;
  userId?: string;
}

export interface ExtendedEventProps {
  isTask?: boolean;
  taskId?: string;
  status?: string;
  priority?: string;
  energyLevel?: string;
  preferredTime?: string;
  tags?: Array<{ id: string; name: string; color?: string }>;
}

export interface CalendarEvent {
  id: string;
  feedId: string;
  externalEventId?: string;
  outlookEventId?: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
  isRecurring: boolean;
  recurrenceRule?: string;
  allDay: boolean;
  color?: string;
  // Additional fields for iCal support
  uid?: string; // Unique identifier from iCal
  sequence?: number; // Modification sequence
  status?: EventStatus; // Event status (confirmed, cancelled, etc.)
  created?: Date; // Creation timestamp
  lastModified?: Date; // Last modification timestamp
  organizer?: {
    name?: string;
    email?: string;
  };
  attendees?: Array<{
    name?: string;
    email: string;
    status?: AttendeeStatus;
  }>;
  // New fields for hybrid approach
  isMaster: boolean;
  masterEventId?: string;
  recurringEventId?: string;
  // Extended properties for custom data
  extendedProps?: ExtendedEventProps;
}

export enum EventStatus {
  CONFIRMED = "CONFIRMED",
  TENTATIVE = "TENTATIVE",
  CANCELLED = "CANCELLED",
}

export enum AttendeeStatus {
  ACCEPTED = "ACCEPTED",
  TENTATIVE = "TENTATIVE",
  DECLINED = "DECLINED",
  NEEDS_ACTION = "NEEDS-ACTION",
}

// A half-open [start, end) window (epoch ms) that has been fetched into the
// store. `truncated` windows are recorded but deliberately NOT treated as full
// coverage, so re-navigating to them re-fetches (see isCovered).
export interface LoadedRange {
  start: number; // epoch ms (inclusive)
  end: number; // epoch ms (exclusive)
  fetchedAt: number; // epoch ms
  truncated: boolean; // this window hit the server row cap
}

export interface CalendarState {
  feeds: CalendarFeed[];
  // Merged, de-duplicated union of every window fetched so far this session.
  // getExpandedEvents/getAllCalendarItems filter this to the visible range.
  events: CalendarEvent[];
  isLoading: boolean;
  error?: string;
  // Coverage index of fetched windows (foreground fetches only).
  loadedRanges: LoadedRange[];
  // Bumped on cache invalidation to cancel stale in-flight window merges.
  fetchGeneration: number;
  // The most recently requested window, so mutation actions can refetch the
  // range the user is currently looking at without threading it through the UI.
  currentWindow?: { start: number; end: number };
}

export type CalendarView = "day" | "week" | "month" | "multiMonth" | "agenda";

export interface CalendarViewState {
  view: CalendarView;
  date: Date;
  selectedEventId?: string;
}

export type CalendarEventWithFeed = CalendarEvent & {
  feed: CalendarFeed;
};

export type ValidatedEvent = CalendarEvent & {
  feed: CalendarFeed & {
    accountId: string;
    url: string;
  };
  externalEventId: string;
};
