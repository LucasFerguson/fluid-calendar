"use client";

import { useEffect, useRef, useState } from "react";

// Tweens from the currently-displayed value to a new value with an
// ease-out curve, so a stat visibly rolls up one increment at a time rather
// than snapping. Animates whenever `value` changes (e.g. as the archive grows
// while the Statistics page polls).
export function AnimatedNumber({
  value,
  className,
  durationMs = 800,
}: {
  value: number;
  className?: string;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);

  useEffect(() => {
    const from = displayRef.current;
    const to = value;
    if (from === to) return;

    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const current = from + (to - from) * eased;
      displayRef.current = current;
      setDisplay(current);
      if (p < 1) {
        raf = requestAnimationFrame(step);
      } else {
        displayRef.current = to;
        setDisplay(to);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return (
    <span className={className}>{Math.round(display).toLocaleString()}</span>
  );
}
