import { useEffect, useRef, useState } from 'react';

let ctx: CanvasRenderingContext2D | null | undefined;

function fontFamily(): string {
  if (typeof document === 'undefined') return 'sans-serif';
  return getComputedStyle(document.body).fontFamily || 'sans-serif';
}

/** Rendered width of `text` in px (canvas measure; char estimate as fallback). */
export function measureText(text: string, fontSize: number, fontWeight = 400): number {
  if (ctx === undefined) {
    ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  if (!ctx) return text.length * fontSize * 0.58;
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily()}`;
  return ctx.measureText(text).width;
}

/** Longest prefix of `text` + "…" that fits in `maxPx`; the full text if it fits. */
export function truncateToWidth(text: string, maxPx: number, fontSize: number): string {
  if (measureText(text, fontSize) <= maxPx) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measureText(`${text.slice(0, mid).trimEnd()}…`, fontSize) <= maxPx) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}

const TICK_GAP = 8;

/**
 * Y-axis width for category labels: as wide as the longest label needs,
 * clamped to [min, max]. Longer labels are truncated by CategoryTick.
 */
export function categoryAxisWidth(
  labels: string[],
  fontSize: number,
  { min = 56, max }: { min?: number; max: number },
): number {
  const widest = labels.reduce((w, l) => Math.max(w, measureText(l, fontSize)), 0);
  return Math.round(Math.min(max, Math.max(min, widest + TICK_GAP + 2)));
}

type TickProps = {
  x?: number;
  y?: number;
  payload?: { value?: unknown };
  /** Axis width in px (Recharts passes it for Y axes). */
  width?: number;
  fontSize: number;
  fill: string;
};

/**
 * Single-line Y-axis category label. Recharts' default tick wraps long
 * labels onto several lines, which overlap neighbouring rows; this one
 * truncates to the axis width and keeps the full text in a <title> so it
 * shows on hover.
 */
export function CategoryTick({ x = 0, y = 0, payload, width = 80, fontSize, fill }: TickProps) {
  const full = String(payload?.value ?? '');
  const shown = truncateToWidth(full, Math.max(12, width - TICK_GAP), fontSize);
  return (
    <text
      x={x}
      y={y}
      dx={-4}
      dy="0.355em"
      textAnchor="end"
      fontSize={fontSize}
      fill={fill}
      style={{ cursor: shown === full ? 'default' : 'help' }}
    >
      <title>{full}</title>
      {shown}
    </text>
  );
}

type XTickProps = {
  x?: number;
  y?: number;
  payload?: { value?: unknown };
  width?: number;
  visibleTicksCount?: number;
  fontSize: number;
  fill: string;
};

/** Single-line X-axis category label truncated to its band width. */
export function CategoryXTick({ x = 0, y = 0, payload, width = 0, visibleTicksCount = 1, fontSize, fill }: XTickProps) {
  const full = String(payload?.value ?? '');
  const band = width / Math.max(1, visibleTicksCount);
  const shown = truncateToWidth(full, Math.max(12, band - 6), fontSize);
  return (
    <text x={x} y={y} dy="0.9em" textAnchor="middle" fontSize={fontSize} fill={fill}>
      <title>{full}</title>
      {shown}
    </text>
  );
}

/** Content-box width of an element, kept current with ResizeObserver. */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
