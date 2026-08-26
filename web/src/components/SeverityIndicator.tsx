import { statusColors } from '../theme/tokens';

export type SeverityLevel = 'CRITICAL' | 'MEDIUM' | 'LOW';

/** Shared bar geometry — keep in sync with mobile SeverityIndicator. */
export const SEVERITY_BAR = {
  widths: [3, 3, 3] as const,
  heights: [6, 10, 14] as const,
  gap: 2,
  radius: 1,
} as const;

const FILLED: Record<SeverityLevel, number> = {
  LOW: 1,
  MEDIUM: 2,
  CRITICAL: 3,
};

const FILL_COLOR: Record<SeverityLevel, string> = {
  LOW: statusColors.severityLow,
  MEDIUM: statusColors.severityMedium,
  CRITICAL: statusColors.severityCritical,
};

export function normalizeSeverity(value: string): SeverityLevel | null {
  const v = value.toUpperCase();
  if (v === 'CRITICAL' || v === 'MEDIUM' || v === 'LOW') return v;
  return null;
}

export function severityFillColor(level: SeverityLevel): string {
  return FILL_COLOR[level];
}

interface SeverityIndicatorProps {
  severity: string;
  /** Optional count shown after the bars (breakdown tables). */
  count?: number;
  className?: string;
  /** Accessible name; defaults to the severity level. */
  label?: string;
  /** Bar + count ink — pass the same color as surrounding chip text. */
  ink?: string;
}

/**
 * Wi-Fi-style severity bars (short → tall, left → right).
 * LOW = 1 bar (blue), MEDIUM = 2 (amber), CRITICAL = 3 (red).
 */
export function SeverityIndicator({
  severity,
  count,
  className = '',
  label,
  ink,
}: SeverityIndicatorProps) {
  const level = normalizeSeverity(severity);
  const filled = level ? FILLED[level] : 0;
  const tone = level ? FILL_COLOR[level] : statusColors.severityEmpty;
  const fill = ink ?? tone;
  const empty = ink
    ? `color-mix(in srgb, ${fill} 35%, transparent)`
    : statusColors.severityEmpty;
  const aria = label ?? (level ?? severity);

  return (
    <span
      className={`inline-flex items-end gap-0.5 align-middle ${className}`}
      style={{ gap: SEVERITY_BAR.gap }}
      role="img"
      aria-label={aria}
      title={aria}
    >
      {SEVERITY_BAR.heights.map((h, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: SEVERITY_BAR.widths[i],
            height: h,
            borderRadius: SEVERITY_BAR.radius,
            backgroundColor: i < filled ? fill : empty,
            opacity: i < filled ? 1 : 0.45,
          }}
        />
      ))}
      {count !== undefined && (
        <span
          className="ml-1.5 text-[12px] font-medium tabular-nums"
          style={{ color: fill, lineHeight: `${SEVERITY_BAR.heights[2]}px` }}
        >
          {count}
        </span>
      )}
    </span>
  );
}
