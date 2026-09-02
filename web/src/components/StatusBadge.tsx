import { inkOn, statusColors } from '../theme/tokens';
import { useI18n, type Translate } from '../i18n';
import { issueStatusColor, issueStatusLabel } from '../lib/issueStatus';
import { vehicleStatusLabel } from '../lib/vehicleStatus';

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
  const { t } = useI18n();
  const { color, label } = resolve(kind, value, t);
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
  t: Translate,
): { color: string; label: string } {
  const v = value.toUpperCase();

  switch (kind) {
    case 'stationStep':
      if (v === 'OK' || v === 'TAMAMLANDI') {
        return { color: statusColors.ok, label: t('status.station.done') };
      }
      if (v === 'NOT_OK' || v === 'BAŞARISIZ') {
        return { color: statusColors.notOk, label: t('status.station.failed') };
      }
      return { color: statusColors.pending, label: t('status.station.pending') };

    case 'eol':
      if (v === 'OK') return { color: statusColors.ok, label: t('status.eol.ok') };
      if (v === 'NOT_OK') return { color: statusColors.notOk, label: t('status.eol.notOk') };
      if (v === 'REWORK') return { color: statusColors.rework, label: t('status.eol.rework') };
      if (v === 'CONDITIONAL_OK') {
        return { color: statusColors.conditionalOk, label: t('status.eol.conditionalOk') };
      }
      return { color: statusColors.pending, label: v || t('status.eol.pending') };

    case 'shipment':
      if (v === 'OK' || v === 'CHECKED' || v === 'CONDITIONAL_OK') {
        return { color: statusColors.ok, label: t('status.shipment.checked') };
      }
      return { color: statusColors.pending, label: t('status.shipment.unchecked') };

    case 'vehicle':
      if (v === 'PLANNED') {
        return { color: statusColors.pending, label: t('status.vehicle.planned') };
      }
      if (v === 'IN_PRODUCTION') {
        return { color: statusColors.vehicleInProduction, label: t('status.vehicle.inProduction') };
      }
      if (v === 'IN_WAREHOUSE') {
        return { color: statusColors.vehicleInWarehouse, label: t('status.vehicle.inWarehouse') };
      }
      if (v === 'DELIVERED' || v === 'WITH_CUSTOMER') {
        return { color: statusColors.vehicleWithCustomer, label: t('status.vehicle.delivered') };
      }
      if (v === 'SHIPPED') {
        return { color: statusColors.vehicleShipped, label: t('status.vehicle.shipped') };
      }
      if (v === 'ON_HOLD') {
        return { color: statusColors.vehicleOnHold, label: t('status.vehicle.onHold') };
      }
      return { color: statusColors.pending, label: vehicleStatusLabel(value, t) };

    case 'issue':
      return { color: issueStatusColor(v), label: issueStatusLabel(v, t) };

    default:
      return { color: statusColors.pending, label: value };
  }
}
