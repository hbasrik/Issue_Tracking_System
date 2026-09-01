import { useI18n } from '../i18n';
import { ActionStamp } from './ActionStamp';
import type { VehicleStatusHistoryEntry } from '../lib/api';

/** Chronological vehicle STATUS_CHANGE trail. */
export function VehicleStatusHistory({
  items,
  error,
}: {
  items: VehicleStatusHistoryEntry[];
  error?: string | null;
}) {
  const { t } = useI18n();
  return (
    <div
      className="rounded-xl border bg-[var(--bg-surface-1)] p-5"
      style={{ borderColor: 'var(--border)' }}
    >
      <h2 className="text-lg font-semibold">{t('vehicles.history')}</h2>
      {error ? (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      ) : null}
      {!error && items.length === 0 ? (
        <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
          {t('vehicles.historyEmpty')}
        </p>
      ) : null}
      {items.length > 0 ? (
        <ol className="mt-3 space-y-3">
          {items.map((row) => (
            <li key={row.ID}>
              <p className="text-[15px] font-medium">
                {row.FromStatus || t('common.emDash')} → {row.ToStatus || t('common.emDash')}
              </p>
              <ActionStamp name={row.ActorName} at={row.EventAt} />
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
