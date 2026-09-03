import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  History,
  Timer,
  Warehouse,
} from 'lucide-react';
import { api, type HomeActivityEntry } from '../lib/api';
import { activityDetailLine } from '../lib/activityDetail';
import { useI18n } from '../i18n';
import { localeTag } from '../../../shared/i18n';
import { statusColors } from '../theme/tokens';
import type { ReactNode } from 'react';

const PAGE_SIZE = 40;
const muted = { color: 'var(--text-secondary)' } as const;

const EVENT_TYPES = [
  '',
  'ISSUE_STATUS_CHANGE',
  'STATUS_CHANGE',
  'EOL_WORKFLOW_STAGE_CHANGE',
  'CHECKLIST_ITEM_UPDATE',
  'MEDIA_UPLOADED',
] as const;

function eventLabel(
  type: string,
  t: ReturnType<typeof useI18n>['t'],
): string {
  switch (type) {
    case 'ISSUE_STATUS_CHANGE':
      return t('activity.filter.issueStatus');
    case 'STATUS_CHANGE':
      return t('activity.filter.vehicleStatus');
    case 'EOL_WORKFLOW_STAGE_CHANGE':
      return t('home.activity.eolStage');
    case 'CHECKLIST_ITEM_UPDATE':
      return t('home.activity.checklist');
    case 'MEDIA_UPLOADED':
      return t('home.activity.media');
    default:
      return t('activity.filter.allTypes');
  }
}

function activityIcon(eventType: string, newValue: string): {
  color: string;
  icon: ReactNode;
} {
  const nv = newValue.toUpperCase();
  if (eventType === 'ISSUE_STATUS_CHANGE') {
    if (nv === 'DONE') return { color: statusColors.ok, icon: <CheckCircle2 size={16} /> };
    if (nv === 'IN_PROGRESS') {
      return { color: statusColors.issueInProgress, icon: <Timer size={16} /> };
    }
    if (nv === 'APPROVED' || nv === 'CONDITIONAL_APPROVED') {
      return { color: statusColors.info, icon: <BadgeCheck size={16} /> };
    }
  }
  if (eventType === 'STATUS_CHANGE' && nv === 'IN_WAREHOUSE') {
    return { color: statusColors.vehicleInWarehouse, icon: <Warehouse size={16} /> };
  }
  if (eventType === 'EOL_WORKFLOW_STAGE_CHANGE') {
    return { color: statusColors.info, icon: <Building2 size={16} /> };
  }
  if (eventType === 'CHECKLIST_ITEM_UPDATE') {
    return { color: statusColors.ok, icon: <ClipboardCheck size={16} /> };
  }
  return { color: statusColors.pending, icon: <AlertCircle size={16} /> };
}

/** Plant-wide audit activity — mirrors vehicle audit trail, paginated. */
export default function ActivityPage() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<HomeActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventType, setEventType] = useState('');
  const [vinSuffix, setVinSuffix] = useState('');
  const [actor, setActor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.auditActivity({
        event_type: eventType || undefined,
        vin_suffix: vinSuffix.trim() || undefined,
        actor: actor.trim() || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setItems(page.Items ?? []);
      setTotal(page.Total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('activity.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [eventType, vinSuffix, actor, from, to, offset, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold sm:text-2xl">
            <History size={22} className="text-[var(--accent)]" aria-hidden />
            {t('activity.title')}
          </h1>
          <p className="mt-1 text-[13px]" style={muted}>
            {t('activity.subtitle')}
          </p>
        </div>
      </div>

      <div
        className="mt-4 grid grid-cols-1 gap-3 rounded-xl border bg-[var(--bg-surface-1)] p-3 sm:grid-cols-2 lg:grid-cols-5"
        style={{ borderColor: 'var(--border)' }}
      >
        <label className="text-[12px]" style={muted}>
          {t('activity.filter.from')}
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setOffset(0);
              setFrom(e.target.value);
            }}
            className="mt-1 block w-full rounded-lg border bg-[var(--bg-page)] px-2 py-1.5 text-[13px] text-[var(--text-primary)]"
            style={{ borderColor: 'var(--border)' }}
          />
        </label>
        <label className="text-[12px]" style={muted}>
          {t('activity.filter.to')}
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setOffset(0);
              setTo(e.target.value);
            }}
            className="mt-1 block w-full rounded-lg border bg-[var(--bg-page)] px-2 py-1.5 text-[13px] text-[var(--text-primary)]"
            style={{ borderColor: 'var(--border)' }}
          />
        </label>
        <label className="text-[12px]" style={muted}>
          {t('activity.filter.type')}
          <select
            value={eventType}
            onChange={(e) => {
              setOffset(0);
              setEventType(e.target.value);
            }}
            className="mt-1 block w-full rounded-lg border bg-[var(--bg-page)] px-2 py-1.5 text-[13px] text-[var(--text-primary)]"
            style={{ borderColor: 'var(--border)' }}
          >
            {EVENT_TYPES.map((et) => (
              <option key={et || 'all'} value={et}>
                {eventLabel(et, t)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px]" style={muted}>
          {t('activity.filter.user')}
          <input
            value={actor}
            onChange={(e) => {
              setOffset(0);
              setActor(e.target.value);
            }}
            placeholder={t('activity.filter.userPlaceholder')}
            className="mt-1 block w-full rounded-lg border bg-[var(--bg-page)] px-2 py-1.5 text-[13px] text-[var(--text-primary)]"
            style={{ borderColor: 'var(--border)' }}
          />
        </label>
        <label className="text-[12px]" style={muted}>
          {t('activity.filter.vin')}
          <input
            value={vinSuffix}
            onChange={(e) => {
              setOffset(0);
              setVinSuffix(e.target.value);
            }}
            placeholder={t('activity.filter.vinPlaceholder')}
            className="mt-1 block w-full rounded-lg border bg-[var(--bg-page)] px-2 py-1.5 text-[13px] text-[var(--text-primary)]"
            style={{ borderColor: 'var(--border)' }}
          />
        </label>
      </div>

      {error && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      <div
        className="mt-4 overflow-x-auto rounded-xl border bg-[var(--bg-surface-1)]"
        style={{ borderColor: 'var(--border)' }}
      >
        <table className="w-full min-w-[48rem] text-left text-[13px]">
          <thead>
            <tr
              className="border-b text-[11px] font-semibold uppercase tracking-wide"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              <th className="px-3 py-2.5">{t('home.colTime')}</th>
              <th className="px-3 py-2.5">{t('home.colAction')}</th>
              <th className="px-3 py-2.5">{t('home.colVehicle')}</th>
              <th className="px-3 py-2.5">{t('home.colDetail')}</th>
              <th className="px-3 py-2.5">{t('home.colUser')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-3 py-6" style={muted}>
                  {t('common.loading')}
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6" style={muted}>
                  {t('home.activityEmpty')}
                </td>
              </tr>
            )}
            {!loading &&
              items.map((row, i) => {
                const icon = activityIcon(row.EventType, row.NewValue);
                const detail = activityDetailLine(row, t);
                return (
                  <tr
                    key={`${row.EventAt}-${row.VIN}-${i}`}
                    className="border-t"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-full"
                          style={{
                            color: icon.color,
                            backgroundColor: `color-mix(in srgb, ${icon.color} 16%, transparent)`,
                          }}
                        >
                          {icon.icon}
                        </span>
                        <span className="tabular-nums" style={muted}>
                          {new Date(row.EventAt).toLocaleString(localeTag(locale), {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-medium">
                      {eventLabel(row.EventType, t)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        to={`/vehicles/${encodeURIComponent(row.VIN)}`}
                        className="font-mono text-[var(--accent)] hover:underline"
                      >
                        …{row.VIN.slice(-6)}
                      </Link>
                    </td>
                    <td className="max-w-[18rem] truncate px-3 py-2.5" style={muted} title={detail}>
                      {detail}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5" style={muted}>
                      {row.ActorName || t('common.emDash')}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px]" style={muted}>
        <span>{t('activity.pagination', { total, page, pages })}</span>
        <button
          type="button"
          disabled={offset <= 0 || loading}
          onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          className="min-h-touch rounded-lg border px-3 py-1.5 disabled:opacity-40"
          style={{ borderColor: 'var(--border)' }}
        >
          {t('common.prev')}
        </button>
        <button
          type="button"
          disabled={offset + PAGE_SIZE >= total || loading}
          onClick={() => setOffset((o) => o + PAGE_SIZE)}
          className="min-h-touch rounded-lg border px-3 py-1.5 disabled:opacity-40"
          style={{ borderColor: 'var(--border)' }}
        >
          {t('common.next')}
        </button>
      </div>
    </section>
  );
}
