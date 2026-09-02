import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  ApiError,
  type ChecklistItem,
  type ChecklistType,
} from '../lib/api';
import { apiErrorMessage } from '../lib/apiErrors';
import { useI18n } from '../i18n';
import { StatusBadge } from './StatusBadge';
import { ActionStamp } from './ActionStamp';
import { checklistActorLines } from '../lib/actionStamp';
import { statusColors } from '../theme/tokens';
import { useAuth } from '../auth/AuthProvider';
import { Perm } from '../auth/permissions';
import { ChecklistPrint } from './print/ChecklistPrint';

interface ChecklistPanelProps {
  vin: string;
  type: ChecklistType;
  /** When set, only items whose EolPhase matches are shown (Branch / Depot). */
  eolPhase?: 'BRANCH' | 'DEPOT';
  title: string;
  hint?: string;
  /** When provided, the parent owns the list (shared Branch/Depot fetch). */
  items?: ChecklistItem[];
  onReload?: () => Promise<void>;
  locked?: boolean;
  lockHint?: string;
}

const PASSING = new Set(['OK', 'CONDITIONAL_OK']);
const EOL_STATUSES = ['OK', 'NOT_OK', 'REWORK', 'CONDITIONAL_OK'] as const;
type EolStatus = (typeof EOL_STATUSES)[number];

const STATUS_COLOR: Record<EolStatus, string> = {
  OK: statusColors.ok,
  NOT_OK: statusColors.notOk,
  REWORK: statusColors.rework,
  CONDITIONAL_OK: statusColors.conditionalOk,
};

function checklistEditPerm(type: ChecklistType): string {
  switch (type) {
    case 'test':
      return Perm.ChecklistTestEdit;
    case 'shipment':
      return Perm.ChecklistShipmentEdit;
    default:
      return Perm.ChecklistEOLEdit;
  }
}

function needsDescription(status: string): boolean {
  return status === 'NOT_OK' || status === 'REWORK' || status === 'CONDITIONAL_OK';
}

function existingDescription(item: ChecklistItem): string {
  return item.ReworkDesc || item.ConditionalDesc || item.RejectedDesc || '';
}

function bodyForStatus(status: string, desc: string): {
  status: string;
  rework_desc?: string;
  conditional_desc?: string;
  rejected_desc?: string;
} {
  const trimmed = desc.trim();
  if (status === 'REWORK') return { status, rework_desc: trimmed };
  if (status === 'CONDITIONAL_OK') return { status, conditional_desc: trimmed };
  if (status === 'NOT_OK') return { status, rejected_desc: trimmed };
  return { status };
}

/** Progress-counter checklist used by Shipment, Test, and EoL stages. */
export function ChecklistPanel({
  vin,
  type,
  eolPhase,
  title,
  hint,
  items: itemsProp,
  onReload,
  locked = false,
  lockHint,
}: ChecklistPanelProps) {
  const { has } = useAuth();
  const { t } = useI18n();
  const canEdit = has(checklistEditPerm(type));
  const [loaded, setLoaded] = useState<ChecklistItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const controlled = itemsProp !== undefined;
  const items = controlled ? itemsProp : loaded;

  const load = useCallback(async () => {
    if (onReload) {
      setError(null);
      await onReload();
      return;
    }
    setError(null);
    try {
      const res = await api.getVehicleChecklist(vin, type);
      setLoaded(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? apiErrorMessage(err, t) : t('checklist.loadFailed'));
      setLoaded([]);
    }
  }, [vin, type, onReload, t]);

  useEffect(() => {
    if (controlled) return;
    void load();
  }, [load, controlled]);

  const visible = useMemo(() => {
    if (!eolPhase) return items;
    return items.filter((item) => item.EolPhase === eolPhase);
  }, [items, eolPhase]);

  const done = visible.filter((item) => PASSING.has(item.Status)).length;
  const editor = type === 'eol' ? 'eol' : 'yesno';
  const readOnly = locked || !canEdit;

  return (
    <div
      className="rounded-xl border bg-[var(--bg-surface-1)] p-4 sm:p-5"
      style={{
        borderColor: 'var(--border)',
        opacity: readOnly ? 0.55 : 1,
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] text-[var(--text-secondary)]">
            {visible.length === 0
              ? t('checklist.none')
              : t('checklist.passing', { done, total: visible.length })}
          </p>
          {!eolPhase ? <ChecklistPrint vin={vin} type={type} items={visible} /> : null}
        </div>
      </div>
      {hint && (
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">{hint}</p>
      )}
      {(locked || !canEdit) && (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--status-conditional-ok)' }} role="status">
          {locked
            ? (lockHint ?? t('checklist.lockHint'))
            : t('checklist.viewOnly')}
        </p>
      )}
      {error && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}
      <ul
        className="mt-4 divide-y"
        style={{
          borderColor: 'var(--border)',
          pointerEvents: readOnly ? 'none' : undefined,
        }}
      >
        {visible.map((item) =>
          editor === 'eol' ? (
            <EolItemRow
              key={item.ItemID}
              vin={vin}
              item={item}
              onSaved={load}
              disabled={readOnly}
            />
          ) : (
            <YesNoItemRow
              key={item.ItemID}
              vin={vin}
              type={type}
              item={item}
              onSaved={load}
              disabled={readOnly}
            />
          ),
        )}
      </ul>
      {visible.length === 0 && !error && (
        <p className="mt-3 text-[13px] text-[var(--text-secondary)]">
          {t('checklist.emptyStage')}
        </p>
      )}
    </div>
  );
}

function EolItemRow({
  vin,
  item,
  onSaved,
  disabled = false,
}: {
  vin: string;
  item: ChecklistItem;
  onSaved: () => Promise<void>;
  disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const savedStatus = (EOL_STATUSES as readonly string[]).includes(item.Status)
    ? (item.Status as EolStatus)
    : '';
  const [status, setStatus] = useState<string>(savedStatus);
  const [desc, setDesc] = useState(existingDescription(item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = (EOL_STATUSES as readonly string[]).includes(item.Status)
      ? item.Status
      : '';
    setStatus(next);
    setDesc(existingDescription(item));
  }, [item]);

  async function save() {
    if (!status) {
      setError(t('checklist.pickStatus'));
      return;
    }
    if (needsDescription(status) && !desc.trim()) {
      setError(t('checklist.descRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.recordChecklist(vin, 'eol', item.ItemID, bodyForStatus(status, desc));
      const file = fileRef.current?.files?.[0];
      if (file) {
        const progressId = item.ProgressID;
        if (!progressId) {
          throw new Error(t('checklist.noProgressId'));
        }
        await api.uploadMedia('CHECKLIST_ITEM_PROGRESS', String(progressId), file);
        if (fileRef.current) fileRef.current.value = '';
        setFileName('');
      }
      await onSaved();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? apiErrorMessage(err, t)
          : err instanceof Error
            ? apiErrorMessage(err, t)
            : t('checklist.saveFailed');
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="py-3 text-[15px]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0 flex-1 break-words">
          <span className="mr-2 text-[13px] text-[var(--text-secondary)]">
            {item.ItemNo}.
          </span>
          {item.ItemText}
        </span>
        <StatusBadge kind="eol" value={item.Status} />
      </div>
      <ActionStamp lines={checklistActorLines(item, t, locale)} />
      <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {EOL_STATUSES.map((value) => {
          const selected = status === value;
          const color = STATUS_COLOR[value];
          return (
            <button
              key={value}
              type="button"
              disabled={disabled || busy}
              onClick={() => setStatus(value)}
              className="min-h-touch rounded-lg border px-2.5 text-[12px] font-medium disabled:opacity-50 sm:px-3 sm:text-[13px]"
              style={{
                borderColor: selected ? color : 'var(--border)',
                color: selected ? color : 'var(--text-secondary)',
                backgroundColor: selected ? `${color}22` : 'transparent',
              }}
            >
              {value === 'CONDITIONAL_OK' ? 'CONDITIONAL' : value}
            </button>
          );
        })}
      </div>
      {needsDescription(status) && (
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          required
          disabled={disabled}
          placeholder={t('checklist.descPlaceholder')}
          className="mt-2 w-full max-w-full rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[13px]"
          style={{ borderColor: 'var(--status-not-ok)', minHeight: 64 }}
        />
      )}
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="flex min-h-touch flex-wrap items-center gap-2 text-[13px] text-[var(--text-secondary)]">
          {t('checklist.photo')}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            disabled={disabled}
            className="sr-only"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
          />
          <span
            className="inline-flex min-h-touch cursor-pointer items-center rounded-lg border px-3 text-[13px]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            {t('checklist.chooseFile')}
          </span>
          {fileName ? (
            <span className="max-w-[12rem] truncate">{fileName}</span>
          ) : null}
        </label>
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => void save()}
          className="min-h-touch rounded-lg bg-[var(--accent)] px-4 text-[13px] text-white disabled:opacity-60"
        >
          {busy ? t('common.saving') : t('common.save')}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--status-not-ok)' }} role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function YesNoItemRow({
  vin,
  type,
  item,
  onSaved,
  disabled = false,
}: {
  vin: string;
  type: ChecklistType;
  item: ChecklistItem;
  onSaved: () => Promise<void>;
  disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const [yes, setYes] = useState(PASSING.has(item.Status));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setYes(PASSING.has(item.Status));
  }, [item]);

  async function toggle(nextYes: boolean) {
    const previous = yes;
    setYes(nextYes);
    setBusy(true);
    setError(null);
    try {
      await api.recordChecklist(vin, type, item.ItemID, {
        status: nextYes ? 'OK' : 'NOT_OK',
      });
      await onSaved();
    } catch (err) {
      setYes(previous);
      const message =
        err instanceof ApiError
          ? apiErrorMessage(err, t)
          : err instanceof Error
            ? apiErrorMessage(err, t)
            : t('checklist.saveFailed');
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="py-3 text-[15px]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <label className="flex min-h-touch flex-1 items-center gap-3">
          <input
            type="checkbox"
            checked={yes}
            disabled={busy || disabled}
            onChange={(e) => void toggle(e.target.checked)}
            className="h-5 w-5 shrink-0"
          />
          <span className="min-w-0 break-words">
            <span className="mr-2 text-[13px] text-[var(--text-secondary)]">
              {item.ItemNo}.
            </span>
            {item.ItemText}
            <span className="ml-2 text-[13px] text-[var(--text-secondary)]">
              {yes ? t('checklist.yesOk') : t('checklist.noNotOk')}
            </span>
          </span>
        </label>
        <StatusBadge kind="shipment" value={item.Status} />
      </div>
      <ActionStamp lines={checklistActorLines(item, t, locale)} />
      {error && (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--status-not-ok)' }} role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
