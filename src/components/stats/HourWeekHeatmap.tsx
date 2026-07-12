"use client";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Single-hue sequential encoding (dataviz method): one accent blue whose alpha
// carries magnitude over the theme's card surface, so it reads correctly in
// both light and dark. A gamma lift keeps low-but-nonzero cells visible.
function cellStyle(value: number, max: number): React.CSSProperties {
  if (value === 0 || max === 0) {
    return { backgroundColor: "transparent" };
  }
  const alpha = 0.08 + 0.92 * Math.pow(value / max, 0.6);
  return { backgroundColor: `rgb(var(--viz-accent) / ${alpha.toFixed(3)})` };
}

function hourLabel(h: number): string {
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

export function HourWeekHeatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  const busiest = { dow: 0, hour: 0, count: 0 };
  grid.forEach((row, dow) =>
    row.forEach((count, hour) => {
      if (count > busiest.count) {
        busiest.dow = dow;
        busiest.hour = hour;
        busiest.count = count;
      }
    })
  );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Hour axis */}
          <div className="mb-1 flex pl-10">
            {HOURS.map((h) => (
              <div
                key={h}
                className="flex-1 text-center text-[10px] text-muted-foreground"
              >
                {h % 3 === 0 ? hourLabel(h) : ""}
              </div>
            ))}
          </div>
          {grid.map((row, dow) => (
            <div key={dow} className="flex items-center">
              <div className="w-10 pr-2 text-right text-xs text-muted-foreground">
                {DAYS[dow]}
              </div>
              <div className="flex flex-1 gap-[2px]">
                {row.map((count, hour) => (
                  <div
                    key={hour}
                    className="aspect-square flex-1 rounded-[3px] ring-1 ring-border"
                    style={cellStyle(count, max)}
                    title={`${DAYS[dow]} ${hourLabel(hour)} — ${count.toLocaleString()} event${count === 1 ? "" : "s"}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Fewer</span>
          <div className="flex gap-[2px]">
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <div
                key={t}
                className="h-3 w-4 rounded-[3px] ring-1 ring-border"
                style={cellStyle(t * max, max)}
              />
            ))}
          </div>
          <span>More</span>
        </div>
        {busiest.count > 0 && (
          <div>
            Busiest:{" "}
            <span className="font-medium text-foreground">
              {DAYS[busiest.dow]} at {hourLabel(busiest.hour)}
            </span>{" "}
            ({busiest.count.toLocaleString()} events)
          </div>
        )}
      </div>
    </div>
  );
}
