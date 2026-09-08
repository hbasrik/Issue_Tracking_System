import {
  deriveVehicleLifecycle,
  vehicleLifecycleColor,
  vehicleLifecycleLabel,
} from '../lib/vehicleStatus';
import { useI18n } from '../i18n';
import { Badge } from './ui';

/** Same derived lifecycle badge as web VehicleStatusDisplay / StatusBadge. */
export function VehicleStatusBadge({
  status,
  eolStage,
}: {
  status: string;
  eolStage?: string | null;
}) {
  const { t } = useI18n();
  const lifecycle = deriveVehicleLifecycle(status, eolStage);
  return (
    <Badge
      label={vehicleLifecycleLabel(lifecycle, t)}
      color={vehicleLifecycleColor(lifecycle)}
    />
  );
}
