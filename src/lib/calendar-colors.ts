// Shared color logic for calendar events.
//
// Event background comes from the calendar feed's color (Google's color, or a
// user override). The text color was previously always white, which is
// unreadable on light backgrounds; instead we pick black or white per
// background using its perceived luminance (YIQ), so every calendar stays
// legible whatever color it is.

export const DEFAULT_EVENT_COLOR = "#3b82f6";

/** Parse a #rgb or #rrggbb hex into [r, g, b], or null if unparseable. */
function parseHex(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "").trim();
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  if (full.length !== 6) return null;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return [r, g, b];
}

/**
 * A readable text color (near-black or white) for the given background.
 * Uses the YIQ perceived-brightness formula; the 150 threshold leans slightly
 * toward dark text, which reads better on the mid-tone blues/greens common in
 * Google calendars.
 */
export function readableTextColor(background?: string | null): string {
  const rgb = background ? parseHex(background) : null;
  if (!rgb) return "#ffffff";
  const [r, g, b] = rgb;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#1a1a1a" : "#ffffff";
}

/**
 * Background / border / text colors for a calendar event, given its feed color
 * (or a task color) and optional opacity (0..1). Opacity fades only the
 * background fill (border stays solid) so a calendar can act as a faint
 * always-on base layer that other events render on top of. `textColor` is
 * auto-contrasted against the solid base color for legibility.
 */
export function getEventColors(
  color?: string | null,
  opacity?: number | null
): {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
} {
  const bg = color || DEFAULT_EVENT_COLOR;
  const a = opacity == null ? 1 : Math.max(0, Math.min(1, opacity));
  const rgb = parseHex(bg);
  const backgroundColor =
    rgb && a < 1 ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})` : bg;
  return {
    backgroundColor,
    borderColor: bg,
    textColor: readableTextColor(bg),
  };
}
