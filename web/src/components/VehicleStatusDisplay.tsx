import { useI18n } from '../i18n';
import { eolStageLabel } from '../lib/vehicleStatus';
import { StatusBadge } from './StatusBadge';

/** Vehicle status badge with optional EOL stage suffix for list views. */
export function VehicleStatusDisplay({
  status,
  eolStage,
}: {
  status: string;
  eolStage?: string | null;
}) {
  const { t } = useI18n();
  const stage = eolStage?.trim();
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <StatusBadge kind="vehicle" value={status} />
      {stage ? (
        <span className="text-[13px] text-[var(--text-secondary)]">
          · {eolStageLabel(stage, t)}
        </span>
      ) : null}
    </span>
  );
}
