import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

/** Viewport edge padding so the panel never touches the window border. */
const VIEWPORT_MARGIN = 8;
/** Below this much room under the anchor, prefer opening upward. */
const MIN_COMFORT_HEIGHT = 180;

type Placement = 'below' | 'above';

interface Position {
  placement: Placement;
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

interface AnchoredPopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Upper bound for the panel height; shrinks further to fit the viewport. */
  maxHeight?: number;
  /** Minimum panel width in px (panel is otherwise as wide as the anchor). */
  minWidth?: number;
  gap?: number;
  className?: string;
  style?: CSSProperties;
  id?: string;
  role?: string;
  ariaMultiselectable?: boolean;
  ariaLabel?: string;
}

function computePosition(
  anchor: HTMLElement,
  maxHeight: number,
  minWidth: number,
  gap: number,
): Position {
  const rect = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceBelow = vh - rect.bottom - gap - VIEWPORT_MARGIN;
  const spaceAbove = rect.top - gap - VIEWPORT_MARGIN;
  const wanted = Math.min(maxHeight, MIN_COMFORT_HEIGHT);
  const placement: Placement =
    spaceBelow < wanted && spaceAbove > spaceBelow ? 'above' : 'below';
  const room = placement === 'below' ? spaceBelow : spaceAbove;

  const width = Math.min(Math.max(rect.width, minWidth), vw - VIEWPORT_MARGIN * 2);
  const left = Math.min(
    Math.max(rect.left, VIEWPORT_MARGIN),
    vw - VIEWPORT_MARGIN - width,
  );

  return {
    placement,
    left,
    width,
    maxHeight: Math.max(Math.min(maxHeight, room), 0),
    ...(placement === 'below'
      ? { top: rect.bottom + gap }
      : { bottom: vh - rect.top + gap }),
  };
}

/**
 * Popover panel portaled to `document.body` and fixed to its anchor, so
 * `overflow: hidden|auto` on any ancestor cannot clip it. Flips upward when
 * there is not enough room below, tracks scroll (any scroll container) and
 * resize, and closes on outside mousedown / Escape.
 *
 * Children should put the scrollable part in a `min-h-0 flex-1 overflow-auto`
 * element; the panel itself is a flex column capped at the computed height.
 */
export function AnchoredPopover({
  anchorRef,
  open,
  onClose,
  children,
  maxHeight = 320,
  minWidth = 0,
  gap = 4,
  className = '',
  style,
  id,
  role,
  ariaMultiselectable,
  ariaLabel,
}: AnchoredPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    setPos(computePosition(anchor, maxHeight, minWidth, gap));
  }, [anchorRef, maxHeight, minWidth, gap]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    update();
  }, [open, update]);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (anchorRef.current) observer?.observe(anchorRef.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [open, update, anchorRef]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onCloseRef.current();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, anchorRef]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role={role}
      aria-multiselectable={ariaMultiselectable}
      aria-label={ariaLabel}
      data-placement={pos.placement}
      className={`fixed z-[70] flex flex-col overflow-hidden rounded-lg border shadow-lg ${className}`}
      style={{
        left: pos.left,
        width: pos.width,
        top: pos.top,
        bottom: pos.bottom,
        maxHeight: pos.maxHeight,
        borderColor: 'var(--border)',
        ...style,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
