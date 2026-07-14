import { statusColors } from '../theme/tokens';

type BadgeKind =
  | 'checkpoint'
  | 'eol'
  | 'shipment'
  | 'vehicle'
  | 'issue'
  | 'severity';

interface StatusBadgeProps {
  kind: BadgeKind;
  value: string;
  className?: string;
}

/**
 * Status badges per docs/07 Section 5 — exact color mapping.
 * Pill chip: 12px text, bg = status color at 15% opacity.
 */
export function StatusBadge({ kind, value, className = '' }: StatusBadgeProps) {
  const { color, label } = resolve(kind, value);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${className}`}
      style={{
        color,
        backgroundColor: hexAlpha(color, 0.15),
      }}
    >
      {label}
    </span>
  );
}

function resolve(
  kind: BadgeKind,
  value: string,
): { color: string; label: string } {
  const v = value.toUpperCase();

  switch (kind) {
    case 'checkpoint':
      if (v === 'OK' || v === 'TAMAMLANDI') {
        return { color: statusColors.ok, label: 'Tamamlandı' };
      }
      if (v === 'NOT_OK' || v === 'BAŞARISIZ') {
        return { color: statusColors.notOk, label: 'Başarısız' };
      }
      return { color: statusColors.pending, label: 'Bekliyor' };

    case 'eol':
      if (v === 'OK') return { color: statusColors.ok, label: 'OK' };
      if (v === 'NOT_OK') return { color: statusColors.notOk, label: 'NOT OK' };
      if (v === 'REWORK') return { color: statusColors.rework, label: 'REWORK' };
      if (v === 'CONDITIONAL_OK') {
        return { color: statusColors.conditionalOk, label: 'CONDITIONAL OK' };
      }
      return { color: statusColors.pending, label: v || 'PENDING' };

    case 'shipment':
      if (v === 'OK' || v === 'CHECKED' || v === 'CONDITIONAL_OK') {
        return { color: statusColors.ok, label: 'Checked' };
      }
      return { color: statusColors.pending, label: 'Unchecked' };

    case 'vehicle':
      if (v === 'IN_PRODUCTION') {
        return { color: statusColors.vehicleInProduction, label: 'IN_PRODUCTION' };
      }
      if (v === 'IN_WAREHOUSE') {
        return { color: statusColors.vehicleInWarehouse, label: 'IN_WAREHOUSE' };
      }
      if (v === 'WITH_CUSTOMER') {
        return { color: statusColors.vehicleWithCustomer, label: 'WITH_CUSTOMER' };
      }
      if (v === 'SHIPPED') {
        return { color: statusColors.vehicleShipped, label: 'SHIPPED' };
      }
      if (v === 'ON_HOLD') {
        return { color: statusColors.vehicleOnHold, label: 'ON_HOLD' };
      }
      return { color: statusColors.pending, label: v };

    case 'issue':
      if (v === 'OPEN') return { color: statusColors.issueOpen, label: 'OPEN' };
      if (v === 'IN_PROGRESS') {
        return { color: statusColors.issueInProgress, label: 'IN_PROGRESS' };
      }
      // DONE / APPROVED / RESOLVED → resolved (green) per Section 5 spirit
      if (v === 'DONE' || v === 'APPROVED' || v === 'RESOLVED') {
        return { color: statusColors.issueResolved, label: v };
      }
      return { color: statusColors.pending, label: v };

    case 'severity':
      if (v === 'CRITICAL') {
        return { color: statusColors.severityCritical, label: 'CRITICAL' };
      }
      if (v === 'MEDIUM') {
        return { color: statusColors.severityMedium, label: 'MEDIUM' };
      }
      if (v === 'LOW') {
        return { color: statusColors.severityLow, label: 'LOW' };
      }
      return { color: statusColors.pending, label: v };

    default:
      return { color: statusColors.pending, label: value };
  }
}

function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
