"use client";

interface Props {
  data: Array<{ year: number; count: number }>;
}

const PLOT_HEIGHT = 200; // px; bars are sized as a % of this fixed area

// Single-series vertical bars (magnitude over an ordinal year axis). One hue,
// baseline-anchored, direct count labels; recessive axis. Fills any gap years
// so the timeline reads continuously.
//
// The plot area has an explicit pixel height because the bars are sized by
// percentage: a flex child's `height: %` only resolves against a parent with a
// definite height (columns are flex-1 for equal WIDTH, which does not give them
// a definite height — hence the fixed-height wrapper).
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
    <div className="overflow-x-auto">
      <div className="min-w-[360px]">
        <div
          className="flex items-end gap-1"
          style={{ height: PLOT_HEIGHT }}
        >
          {years.map(({ year, count }) => (
            <div
              key={year}
              className="flex h-full min-w-[24px] flex-1 flex-col items-center justify-end gap-1"
              title={`${year} — ${count.toLocaleString()} events`}
            >
              {count > 0 && (
                <div className="text-[10px] tabular-nums text-muted-foreground">
                  {count.toLocaleString()}
                </div>
              )}
              <div
                className="w-full rounded-t-[4px]"
                style={{
                  // Cap at 90% so the count label always has headroom.
                  height: `${count > 0 ? Math.max(2, (count / max) * 90) : 0}%`,
                  backgroundColor: "rgb(var(--viz-accent))",
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1">
          {years.map(({ year }) => (
            <div
              key={year}
              className="min-w-[24px] flex-1 text-center text-[10px] tabular-nums text-muted-foreground"
            >
              {year}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
