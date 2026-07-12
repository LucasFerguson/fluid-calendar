"use client";

interface Props {
  data: Array<{ id: string; name: string; color: string | null; count: number }>;
}

const MAX_ROWS = 15;

// Horizontal magnitude bars, one row per calendar, each painted in that
// calendar's own color (identity encoding — the color already means "this
// calendar" everywhere else in the app). Beyond MAX_ROWS the tail folds into a
// labeled "Other" row rather than being silently dropped.
export function CalendarBreakdown({ data }: Props) {
  const nonEmpty = data.filter((d) => d.count > 0);
  if (nonEmpty.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No events archived yet.
      </div>
    );
  }

  const shown = nonEmpty.slice(0, MAX_ROWS);
  const rest = nonEmpty.slice(MAX_ROWS);
  const rows = [...shown];
  if (rest.length > 0) {
    rows.push({
      id: "__other__",
      name: `Other (${rest.length} calendars)`,
      color: null,
      count: rest.reduce((s, d) => s + d.count, 0),
    });
  }
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-3 text-sm">
          <div className="w-40 shrink-0 truncate" title={row.name}>
            {row.name}
          </div>
          <div className="flex-1">
            <div
              className="h-5 rounded-[4px]"
              style={{
                width: `${Math.max(2, (row.count / max) * 100)}%`,
                backgroundColor: row.color || "rgb(var(--viz-accent))",
              }}
            />
          </div>
          <div className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
            {row.count.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
