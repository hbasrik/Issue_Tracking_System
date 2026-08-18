import { View, Text, StyleSheet } from 'react-native';
import { statusColors } from '../theme/tokens';

export type SeverityLevel = 'CRITICAL' | 'MEDIUM' | 'LOW';

/** Shared bar geometry — keep in sync with web SeverityIndicator. */
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
  /** Optional count shown after the bars (breakdown lists). */
  count?: number;
  size?: 'sm' | 'md';
}

/**
 * Wi-Fi-style severity bars (short → tall, left → right).
 * LOW = 1 bar (blue), MEDIUM = 2 (amber), CRITICAL = 3 (red).
 * Geometry matches web/src/components/SeverityIndicator.tsx.
 */
export function SeverityIndicator({
  severity,
  count,
  size = 'sm',
}: SeverityIndicatorProps) {
  const level = normalizeSeverity(severity);
  const filled = level ? FILLED[level] : 0;
  const fill = level ? FILL_COLOR[level] : statusColors.severityEmpty;
  const empty = statusColors.severityEmpty;
  const scale = size === 'md' ? 1.35 : 1;

  return (
    <View
      style={styles.row}
      accessibilityRole="image"
      accessibilityLabel={level ?? severity}
    >
      {SEVERITY_BAR.heights.map((h, i) => (
        <View
          key={i}
          style={{
            width: SEVERITY_BAR.widths[i] * scale,
            height: h * scale,
            borderRadius: SEVERITY_BAR.radius,
            backgroundColor: i < filled ? fill : empty,
            opacity: i < filled ? 1 : 0.45,
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
