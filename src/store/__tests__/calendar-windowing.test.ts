import { addRange, isCovered, mergeEvents } from "@/store/calendar";

import { CalendarEvent, LoadedRange } from "@/types/calendar";

// Fixed epoch anchors (ms) for readable window math.
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1); // 2026-01-01

function range(
  startOffsetDays: number,
  endOffsetDays: number,
  truncated = false
): LoadedRange {
  return {
    start: T0 + startOffsetDays * DAY,
    end: T0 + endOffsetDays * DAY,
    fetchedAt: 0,
    truncated,
  };
}

function d(offsetDays: number): Date {
  return new Date(T0 + offsetDays * DAY);
}

function evt(id: string, startOffsetDays: number): CalendarEvent {
  return {
    id,
    feedId: "feed-1",
    title: id,
    start: new Date(T0 + startOffsetDays * DAY).toISOString() as unknown as Date,
    end: new Date(
      T0 + (startOffsetDays + 1) * DAY
    ).toISOString() as unknown as Date,
    isRecurring: false,
    allDay: false,
    isMaster: false,
  };
}

describe("isCovered", () => {
  it("returns true when the window is fully inside a loaded range", () => {
    const ranges = [range(0, 30)];
    expect(isCovered(ranges, d(5), d(10))).toBe(true);
  });

  it("returns true for an exact match", () => {
    const ranges = [range(0, 30)];
    expect(isCovered(ranges, d(0), d(30))).toBe(true);
  });

  it("returns false when the window extends past the loaded range", () => {
    const ranges = [range(0, 30)];
    expect(isCovered(ranges, d(20), d(40))).toBe(false);
  });

  it("returns false when there is no coverage at all", () => {
    expect(isCovered([], d(0), d(10))).toBe(false);
  });

  it("ignores truncated ranges — they never count as coverage", () => {
    const ranges = [range(0, 30, true)];
    expect(isCovered(ranges, d(5), d(10))).toBe(false);
  });
});

describe("addRange", () => {
  it("coalesces overlapping non-truncated ranges", () => {
    let ranges: LoadedRange[] = [];
    ranges = addRange(ranges, range(0, 10));
    ranges = addRange(ranges, range(5, 20));
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe(T0);
    expect(ranges[0].end).toBe(T0 + 20 * DAY);
  });

  it("coalesces adjacent ranges (touching endpoints)", () => {
    let ranges: LoadedRange[] = [];
    ranges = addRange(ranges, range(0, 10));
    ranges = addRange(ranges, range(10, 20));
    expect(ranges).toHaveLength(1);
    expect(ranges[0].end).toBe(T0 + 20 * DAY);
  });

  it("keeps disjoint ranges separate", () => {
    let ranges: LoadedRange[] = [];
    ranges = addRange(ranges, range(0, 10));
    ranges = addRange(ranges, range(20, 30));
    expect(ranges).toHaveLength(2);
  });

  it("keeps truncated ranges but never merges them into coverage", () => {
    let ranges: LoadedRange[] = [];
    ranges = addRange(ranges, range(0, 10));
    ranges = addRange(ranges, range(5, 20, true));
    // The truncated range is retained but the solid coverage is unchanged.
    const solid = ranges.filter((r) => !r.truncated);
    const truncated = ranges.filter((r) => r.truncated);
    expect(solid).toHaveLength(1);
    expect(solid[0].end).toBe(T0 + 10 * DAY);
    expect(truncated).toHaveLength(1);
  });

  it("coalescing then isCovered spans the merged union", () => {
    let ranges: LoadedRange[] = [];
    ranges = addRange(ranges, range(0, 10));
    ranges = addRange(ranges, range(8, 20));
    expect(isCovered(ranges, d(3), d(18))).toBe(true);
  });
});

describe("mergeEvents", () => {
  it("de-duplicates by id, newest wins", () => {
    const prev = [evt("a", 0), evt("b", 1)];
    const incoming = [{ ...evt("a", 5), title: "a-updated" }];
    const merged = mergeEvents(prev, incoming);
    expect(merged).toHaveLength(2);
    const a = merged.find((e) => e.id === "a");
    expect(a?.title).toBe("a-updated");
  });

  it("appends new events not seen before", () => {
    const merged = mergeEvents([evt("a", 0)], [evt("b", 1)]);
    expect(merged.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("normalizes incoming ISO string dates into Date objects", () => {
    const merged = mergeEvents([], [evt("a", 0)]);
    expect(merged[0].start).toBeInstanceOf(Date);
    expect(merged[0].end).toBeInstanceOf(Date);
  });

  it("returns a new array without mutating prev", () => {
    const prev = [evt("a", 0)];
    const merged = mergeEvents(prev, [evt("b", 1)]);
    expect(prev).toHaveLength(1);
    expect(merged).not.toBe(prev);
  });
});
