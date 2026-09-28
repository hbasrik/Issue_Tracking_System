import { statusColors } from '../theme/tokens';
import { severityColors } from '../../../shared/brand';
import {
  SEVERITY_BAR,
  SEVERITY_BAR_MD_SCALE,
  SEVERITY_FILLED_BARS as FILLED,
  type SeverityBarLevel,
} from '../../../shared/severityBars';
import { useI18n } from '../i18n';

export type SeverityLevel = SeverityBarLevel;

const FILL_COLOR: Record<SeverityLevel, string> = {
  LOW: severityColors.LOW,
  MEDIUM: severityColors.MEDIUM,
  CRITICAL: severityColors.CRITICAL,
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
  /** Parent already names the control — hide bars from the accessibility tree. */
  decorative?: boolean;
  size?: 'sm' | 'md';
}

/**
 * Wi-Fi-style severity bars (short → tall, left → right).
 * LOW = 1 solid bar (blue), MEDIUM = 2 (amber), CRITICAL = 3 (red);
 * remaining bars are hollow outlines. Geometry: shared/severityBars.ts.
 */
export function SeverityIndicator({
  severity,
  count,
  className = '',
  label,
  ink,
  decorative = false,
  size = 'sm',
}: SeverityIndicatorProps) {
  const { t } = useI18n();
  const level = normalizeSeverity(severity);
  const filled = level ? FILLED[level] : 0;
  const tone = level ? FILL_COLOR[level] : statusColors.severityEmpty;
  const fill = ink ?? tone;
  const empty = ink
    ? `color-mix(in srgb, ${fill} 60%, transparent)`
    : statusColors.severityEmpty;
  const translated =
    level === 'CRITICAL'
      ? t('severity.critical')
      : level === 'MEDIUM'
        ? t('severity.medium')
        : level === 'LOW'
          ? t('severity.low')
          : severity;
  const aria = label ?? translated;
  const scale = size === 'md' ? SEVERITY_BAR_MD_SCALE : 1;

  return (
    <span
      className={`inline-flex shrink-0 items-end align-middle ${className}`}
      style={{ gap: SEVERITY_BAR.gap * scale }}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : aria}
      title={decorative ? undefined : aria}
      data-severity-bars={filled}
    >
      {SEVERITY_BAR.heights.map((h, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            boxSizing: 'border-box',
            width: SEVERITY_BAR.widths[i] * scale,
            height: h * scale,
            borderRadius: SEVERITY_BAR.radius,
            backgroundColor: i < filled ? fill : 'transparent',
            border: i < filled ? 'none' : `${SEVERITY_BAR.emptyBorder}px solid ${empty}`,
          }}
        />
      ))}
      {count !== undefined && (
        <span
          className="ml-1.5 text-[12px] font-medium tabular-nums"
          style={{ color: fill, lineHeight: `${SEVERITY_BAR.heights[2] * scale}px` }}
        >
          {count}
        </span>
      )}
    </span>
  );
}
