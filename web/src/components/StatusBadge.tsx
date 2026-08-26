import { inkOn, statusColors } from '../theme/tokens';
import { issueStatusColor, issueStatusLabel } from '../lib/issueStatus';

type BadgeKind =
  | 'stationStep'
  | 'eol'
  | 'shipment'
  | 'vehicle'
  | 'issue';

interface StatusBadgeProps {
  kind: BadgeKind;
  value: string;
  className?: string;
}

/**
 * Status badges — same token fill as selected filter chips, ink chosen
 * for WCAG AA on that fill (white on dark, dark on light).
 */
export function StatusBadge({ kind, value, className = '' }: StatusBadgeProps) {
  const { color, label } = resolve(kind, value);
  const ink = inkOn(color);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${className}`}
      style={{
        color: ink,
        backgroundColor: color,
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
    case 'stationStep':
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
      return { color: issueStatusColor(v), label: issueStatusLabel(v) };

    default:
      return { color: statusColors.pending, label: value };
  }
}
