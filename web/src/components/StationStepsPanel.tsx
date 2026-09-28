import { useEffect, useMemo, useState } from 'react';
import { Circle, CircleCheck, CircleDot, type LucideIcon } from 'lucide-react';
import {
  STATION_PROGRESS_MESSAGE_KEYS,
  stationProgress,
  type StationProgress,
} from '../../../shared/stationProgress';
import { statusColors } from '../theme/tokens';
import { useI18n } from '../i18n';
import { api, type StationStepItem } from '../lib/api';
import { apiErrorMessage } from '../lib/apiErrors';
import { ActionStamp } from './ActionStamp';
import { StatusBadge } from './StatusBadge';

const STATION_PROGRESS_ICON: Record<StationProgress, LucideIcon> = {
  DONE: CircleCheck,
  IN_PROGRESS: CircleDot,
  NOT_STARTED: Circle,
};

function stationProgressColor(progress: StationProgress): string {
  if (progress === 'DONE') return statusColors.ok;
  if (progress === 'IN_PROGRESS') return statusColors.issueInProgress;
  return statusColors.pending;
}

/** Per-vehicle station steps with the last operator who ticked each row. */
export function StationStepsPanel({
  vin,
  currentStationId = null,
}: {
  vin: string;
  currentStationId?: number | null;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<StationStepItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .getStationSteps(vin)
      .then((res) => {
        if (!cancelled) setItems(res.Items ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? apiErrorMessage(err, t) : t('vehicles.stepsFailed'),
          );
          setItems([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [vin, t]);

  const groups = useMemo(() => {
    const out: { id: number; name: string; steps: StationStepItem[] }[] = [];
    const byId = new Map<number, { id: number; name: string; steps: StationStepItem[] }>();
    for (const step of items) {
      let group = byId.get(step.StationID);
      if (!group) {
        group = { id: step.StationID, name: step.StationName, steps: [] };
        byId.set(step.StationID, group);
        out.push(group);
      }
      group.steps.push(step);
    }
    for (const group of out) {
      group.steps.sort((a, b) => a.SequenceNo - b.SequenceNo);
    }
    return out;
  }, [items]);

  return (
    <div
      className="rounded-xl border bg-[var(--bg-surface-1)] p-5"
      style={{ borderColor: 'var(--border)' }}
    >
      <h2 className="text-lg font-semibold">{t('vehicles.stationSteps')}</h2>
      {error && (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}
      {groups.length === 0 && !error && (
        <p className="mt-2 text-[13px] text-[var(--text-secondary)]">{t('vehicles.noSteps')}</p>
      )}
      <ul className="mt-4 space-y-4">
        {groups.map((group) => {
          const progress = stationProgress(group.steps, group.id === currentStationId);
          const color = stationProgressColor(progress);
          const Icon = STATION_PROGRESS_ICON[progress];
          return (
          <li key={group.id}>
            <div className="flex min-w-0 items-center gap-2.5" data-station-row>
              <Icon size={24} strokeWidth={2.25} className="shrink-0" style={{ color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <h3 className="break-words text-[14px] font-semibold text-[var(--text-primary)]">
                  {group.name}
                </h3>
                <p className="text-[12px] font-semibold" style={{ color }}>
                  {t(STATION_PROGRESS_MESSAGE_KEYS[progress])}
                </p>
              </div>
            </div>
            <ul className="mt-2 divide-y" style={{ borderColor: 'var(--border)' }}>
              {group.steps.map((step) => (
                <li key={step.ID} className="py-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 break-words text-[15px]">
                      {step.Name}
                    </span>
                    <StatusBadge kind="stationStep" value={step.Status} />
                  </div>
                  {step.Status !== 'PENDING' ? (
                    <ActionStamp name={step.CheckedByName} at={step.CheckedAt} />
                  ) : null}
                </li>
              ))}
            </ul>
          </li>
          );
        })}
      </ul>
    </div>
  );
}
