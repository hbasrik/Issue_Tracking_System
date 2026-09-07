import { deriveVehicleLifecycle } from '../lib/vehicleStatus';
import { StatusBadge } from './StatusBadge';

/** Single lifecycle badge for vehicle list/detail (replaces status · stage). */
export function VehicleStatusDisplay({
  status,
  eolStage,
}: {
  status: string;
  eolStage?: string | null;
}) {
  const lifecycle = deriveVehicleLifecycle(status, eolStage);
  return <StatusBadge kind="lifecycle" value={lifecycle} />;
}
