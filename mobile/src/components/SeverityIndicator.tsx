import { View, Text, StyleSheet } from 'react-native';
import { statusColors } from '../theme/tokens';
import { severityColors } from '../../../shared/brand';
import {
  SEVERITY_BAR,
  SEVERITY_BAR_MD_SCALE,
  SEVERITY_FILLED_BARS as FILLED,
  type SeverityBarLevel,
} from '../../../shared/severityBars';
import { useI18n } from '../i18n';
import type { Translate } from '../../../shared/i18n';

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

export function severityLabel(level: SeverityLevel, t: Translate): string {
  switch (level) {
    case 'CRITICAL':
      return t('severity.critical');
    case 'MEDIUM':
      return t('severity.medium');
    case 'LOW':
      return t('severity.low');
  }
}

interface SeverityIndicatorProps {
  severity: string;
  /** Optional count shown after the bars (breakdown lists). */
  count?: number;
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
  size = 'sm',
}: SeverityIndicatorProps) {
  const { t } = useI18n();
  const level = normalizeSeverity(severity);
  const filled = level ? FILLED[level] : 0;
  const fill = level ? FILL_COLOR[level] : statusColors.severityEmpty;
  const empty = statusColors.severityEmpty;
  const scale = size === 'md' ? SEVERITY_BAR_MD_SCALE : 1;
  const a11y = level ? severityLabel(level, t) : severity;

  return (
    <View
      style={styles.row}
      accessibilityRole="image"
      accessibilityLabel={a11y}
    >
      {SEVERITY_BAR.heights.map((h, i) => (
        <View
          key={i}
          style={{
            width: SEVERITY_BAR.widths[i] * scale,
            height: h * scale,
            borderRadius: SEVERITY_BAR.radius,
            backgroundColor: i < filled ? fill : 'transparent',
            borderWidth: i < filled ? 0 : SEVERITY_BAR.emptyBorder,
            borderColor: empty,
            marginRight: i < 2 ? SEVERITY_BAR.gap * scale : 0,
          }}
        />
      ))}
      {count !== undefined ? (
        <Text style={[styles.count, { color: fill, fontSize: 12 * scale }]}>
          {count}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  count: {
    marginLeft: 6,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
