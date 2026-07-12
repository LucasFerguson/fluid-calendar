"use client";

interface Props {
  data: Array<{ year: number; count: number }>;
}

// Single-series vertical bars (magnitude over an ordinal year axis). One hue,
// baseline-anchored, direct count labels; recessive axis. Fills any gap years
// so the timeline reads continuously.
export function YearBarChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No dated events yet.
      </div>
    );
  }

  const minYear = data[0].year;
  const maxYear = data[data.length - 1].year;
  const byYear = new Map(data.map((d) => [d.year, d.count]));
  const years: Array<{ year: number; count: number }> = [];
  for (let y = minYear; y <= maxYear; y++) {
    years.push({ year: y, count: byYear.get(y) ?? 0 });
  }
  const max = Math.max(1, ...years.map((y) => y.count));

  return (
    <div className="flex h-56 items-end gap-1 overflow-x-auto">
      {years.map(({ year, count }) => (
        <div
          key={year}
          className="flex min-w-[28px] flex-1 flex-col items-center justify-end gap-1"
          title={`${year} — ${count.toLocaleString()} events`}
        >
          <div className="text-[10px] tabular-nums text-muted-foreground">
            {count > 0 ? count.toLocaleString() : ""}
          </div>
          <div
            className="w-full rounded-t-[4px]"
            style={{
              height: `${Math.max(count > 0 ? 3 : 0, (count / max) * 100)}%`,
              backgroundColor: "rgb(var(--viz-accent))",
            }}
          />
          <div className="text-[10px] tabular-nums text-muted-foreground">
            {year}
          </div>
        </div>
      ))}
    </div>
  );
}
