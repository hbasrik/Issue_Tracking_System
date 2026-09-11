import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  api,
  type DefectCatalogueWrite,
  type DefectPart,
  type DefectProcess,
  type DefectType,
  type DefectZone,
} from '../lib/api';
import { apiErrorMessage } from '../lib/apiErrors';
import { ActiveBadge } from '../components/ActiveBadge';
import { useConfirm } from '../components/ConfirmDialog';
import { useI18n } from '../i18n';

type Tab = 'zones' | 'parts' | 'types' | 'processes';

const inputClass =
  'min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';
const btnPrimary =
  'min-h-touch rounded-lg bg-[var(--accent)] px-3 text-[13px] font-medium text-white disabled:opacity-40';
const btnGhost =
  'min-h-touch rounded-lg border px-3 text-[13px] hover:bg-[var(--bg-surface-2)] disabled:opacity-40';

type Draft = {
  code: string;
  name_tr: string;
  name_en: string;
  sort_order: number;
  is_active: boolean;
  zone_id?: number;
  default_process_id?: number | null;
};

function emptyDraft(): Draft {
  return { code: '', name_tr: '', name_en: '', sort_order: 1, is_active: true };
}

/** Defect classification masters — editable without migrations. */
export default function DefectCatalogPage() {
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('zones');
  const [zones, setZones] = useState<DefectZone[]>([]);
  const [parts, setParts] = useState<DefectPart[]>([]);
  const [types, setTypes] = useState<DefectType[]>([]);
  const [processes, setProcesses] = useState<DefectProcess[]>([]);
  const [filterZone, setFilterZone] = useState<number | ''>('');
  const [hideInactive, setHideInactive] = useState(true);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const nameOf = useCallback(
    (tr: string, en: string) => (locale === 'en' ? en || tr : tr || en),
    [locale],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [z, p, ty, pr] = await Promise.all([
        api.listDefectZones(),
        api.listDefectParts(),
        api.listDefectTypes(),
        api.listDefectProcesses(),
      ]);
      setZones(z.items ?? []);
      setParts(p.items ?? []);
      setTypes(ty.items ?? []);
      setProcesses(pr.items ?? []);
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  function startCreate() {
    setEditId(null);
    const base = emptyDraft();
    if (tab === 'parts' && filterZone !== '') base.zone_id = filterZone;
    setDraft(base);
  }

  function startEdit(row: {
    ID: number;
    Code: string;
    NameTR: string;
    NameEN: string;
    SortOrder: number;
    IsActive: boolean;
    ZoneID?: number;
    DefaultProcessID?: number | null;
  }) {
    setEditId(row.ID);
    setDraft({
      code: row.Code,
      name_tr: row.NameTR,
      name_en: row.NameEN,
      sort_order: row.SortOrder,
      is_active: row.IsActive,
      zone_id: row.ZoneID,
      default_process_id: row.DefaultProcessID ?? null,
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    const body: DefectCatalogueWrite = {
      code: draft.code.trim(),
      name_tr: draft.name_tr.trim(),
      name_en: draft.name_en.trim(),
      sort_order: draft.sort_order || 1,
      is_active: draft.is_active,
    };
    try {
      if (tab === 'zones') {
        if (editId == null) await api.createDefectZone(body);
        else await api.updateDefectZone(editId, body);
      } else if (tab === 'parts') {
        const zone_id = draft.zone_id ?? 0;
        if (!zone_id) throw new Error(t('defects.zoneRequired'));
        if (editId == null) await api.createDefectPart({ ...body, zone_id });
        else await api.updateDefectPart(editId, { ...body, zone_id });
      } else if (tab === 'types') {
        const payload = { ...body, default_process_id: draft.default_process_id ?? null };
        if (editId == null) await api.createDefectType(payload);
        else await api.updateDefectType(editId, payload);
      } else {
        if (editId == null) await api.createDefectProcess(body);
        else await api.updateDefectProcess(editId, body);
      }
      setEditId(null);
      setDraft(emptyDraft());
      await load();
    } catch (err) {
      setError(err instanceof Error ? apiErrorMessage(err, t) : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: { ID: number; Code: string; NameTR: string; NameEN: string; SortOrder: number; IsActive: boolean; ZoneID?: number; DefaultProcessID?: number | null }) {
    setBusy(true);
    setError(null);
    const body: DefectCatalogueWrite = {
      code: row.Code,
      name_tr: row.NameTR,
      name_en: row.NameEN,
      sort_order: row.SortOrder,
      is_active: !row.IsActive,
    };
    try {
      if (tab === 'zones') await api.updateDefectZone(row.ID, body);
      else if (tab === 'parts') await api.updateDefectPart(row.ID, { ...body, zone_id: row.ZoneID! });
      else if (tab === 'types') {
        await api.updateDefectType(row.ID, { ...body, default_process_id: row.DefaultProcessID ?? null });
      } else await api.updateDefectProcess(row.ID, body);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number, usage: number) {
    if (usage > 0) {
      await confirm({
        mode: 'alert',
        tone: 'warning',
        title: t('defects.cannotDeleteTitle'),
        message: t('defects.cannotDeleteMessage', { n: usage }),
      });
      return;
    }
    const ok = await confirm({
      title: t('defects.deleteTitle'),
      message: t('defects.deleteConfirm'),
      tone: 'danger',
      confirmLabel: t('common.delete'),
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      if (tab === 'zones') await api.deleteDefectZone(id);
      else if (tab === 'parts') await api.deleteDefectPart(id);
      else if (tab === 'types') await api.deleteDefectType(id);
      else await api.deleteDefectProcess(id);
      if (editId === id) {
        setEditId(null);
        setDraft(emptyDraft());
      }
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function move(visibleId: number, dir: -1 | 1) {
    // Reorder against the full catalogue set (including inactive), matching
    // the backend sameIntSet check — not the filtered visible rows.
    let fullIds: number[] = [];
    let zoneId: number | undefined;
    if (tab === 'zones') {
      fullIds = zones.map((z) => z.ID);
    } else if (tab === 'parts') {
      const moved = parts.find((p) => p.ID === visibleId);
      zoneId = moved?.ZoneID;
      if (!zoneId) return;
      fullIds = parts.filter((p) => p.ZoneID === zoneId).map((p) => p.ID);
    } else if (tab === 'types') {
      fullIds = types.map((ty) => ty.ID);
    } else {
      fullIds = processes.map((p) => p.ID);
    }
    const index = fullIds.indexOf(visibleId);
    const j = index + dir;
    if (index < 0 || j < 0 || j >= fullIds.length) return;
    const next = fullIds.slice();
    [next[index], next[j]] = [next[j], next[index]];
    setBusy(true);
    try {
      if (tab === 'zones') await api.reorderDefectZones(next);
      else if (tab === 'parts') await api.reorderDefectParts(zoneId!, next);
      else if (tab === 'types') await api.reorderDefectTypes(next);
      else await api.reorderDefectProcesses(next);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  const rows = useMemo(() => {
    if (tab === 'zones') {
      return zones
        .filter((z) => !hideInactive || z.IsActive)
        .map((z) => ({
          id: z.ID,
          code: z.Code,
          name: nameOf(z.NameTR, z.NameEN),
          meta: t('defects.partsCount', { n: z.PartCount }),
          active: z.IsActive,
          usage: z.UsageCount + z.PartCount,
          raw: z,
        }));
    }
    if (tab === 'parts') {
      return parts
        .filter((p) => (filterZone === '' || p.ZoneID === filterZone) && (!hideInactive || p.IsActive))
        .map((p) => ({
          id: p.ID,
          code: p.Code,
          name: nameOf(p.NameTR, p.NameEN),
          meta: nameOf(p.ZoneNameTR, p.ZoneNameEN),
          active: p.IsActive,
          usage: p.UsageCount,
          raw: p,
        }));
    }
    if (tab === 'types') {
      return types
        .filter((ty) => !hideInactive || ty.IsActive)
        .map((ty) => ({
          id: ty.ID,
          code: ty.Code,
          name: nameOf(ty.NameTR, ty.NameEN),
          meta: ty.ProcessCode
            ? nameOf(ty.ProcessNameTR, ty.ProcessNameEN)
            : t('defects.noDefaultProcess'),
          active: ty.IsActive,
          usage: ty.UsageCount,
          raw: ty,
        }));
    }
    return processes
      .filter((p) => !hideInactive || p.IsActive)
      .map((p) => ({
        id: p.ID,
        code: p.Code,
        name: nameOf(p.NameTR, p.NameEN),
        meta: t('defects.usageCount', { n: p.UsageCount }),
        active: p.IsActive,
        usage: p.UsageCount,
        raw: p,
      }));
  }, [tab, zones, parts, types, processes, hideInactive, filterZone, nameOf, t]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'zones', label: t('defects.tabZones') },
    { id: 'parts', label: t('defects.tabParts') },
    { id: 'types', label: t('defects.tabTypes') },
    { id: 'processes', label: t('defects.tabProcesses') },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t('defects.title')}</h1>
        <p className="mt-1 text-[14px] text-[var(--text-secondary)]">{t('defects.subtitle')}</p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            className={tab === tb.id ? btnPrimary : btnGhost}
            style={tab === tb.id ? undefined : { borderColor: 'var(--border)' }}
            onClick={() => {
              setTab(tb.id);
              setEditId(null);
              setDraft(emptyDraft());
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={hideInactive}
            onChange={(e) => setHideInactive(e.target.checked)}
          />
          {t('defects.hideInactive')}
        </label>
        {tab === 'parts' ? (
          <select
            className={`${inputClass} max-w-[14rem]`}
            style={{ borderColor: 'var(--border)' }}
            value={filterZone === '' ? '' : String(filterZone)}
            onChange={(e) => setFilterZone(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">{t('defects.allZones')}</option>
            {zones.map((z) => (
              <option key={z.ID} value={z.ID}>
                {z.Code} — {nameOf(z.NameTR, z.NameEN)}
              </option>
            ))}
          </select>
        ) : null}
        <button type="button" className={btnPrimary} disabled={busy} onClick={startCreate}>
          {t('defects.add')}
        </button>
      </div>

      {error ? (
        <p className="mb-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div
          className="overflow-hidden rounded-xl border bg-[var(--bg-surface-1)]"
          style={{ borderColor: 'var(--border)' }}
        >
          {loading ? (
            <p className="p-4 text-[14px] text-[var(--text-secondary)]">{t('common.loading')}</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-[14px] text-[var(--text-secondary)]">{t('defects.empty')}</p>
          ) : (
            <table className="w-full text-left text-[14px]">
              <thead>
                <tr
                  className="border-b text-[12px] uppercase tracking-wide text-[var(--text-secondary)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <th className="px-3 py-2">{t('defects.colCode')}</th>
                  <th className="px-3 py-2">{t('defects.colName')}</th>
                  <th className="px-3 py-2">{t('defects.colMeta')}</th>
                  <th className="px-3 py-2">{t('defects.colStatus')}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={row.id}
                    className="border-t"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: editId === row.id ? 'var(--bg-surface-2)' : undefined,
                    }}
                  >
                    <td className="px-3 py-2 font-mono text-[13px]">{row.code}</td>
                    <td className="px-3 py-2 font-medium">{row.name}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{row.meta}</td>
                    <td className="px-3 py-2">
                      <ActiveBadge active={row.active} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button
                          type="button"
                          className={btnGhost}
                          style={{ borderColor: 'var(--border)' }}
                          disabled={busy || idx === 0}
                          onClick={() => void move(row.id, -1)}
                          aria-label={t('common.moveUp')}
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button
                          type="button"
                          className={btnGhost}
                          style={{ borderColor: 'var(--border)' }}
                          disabled={busy || idx === rows.length - 1}
                          onClick={() => void move(row.id, 1)}
                          aria-label={t('common.moveDown')}
                        >
                          <ChevronDown size={16} />
                        </button>
                        <button
                          type="button"
                          className={btnGhost}
                          style={{ borderColor: 'var(--border)' }}
                          disabled={busy}
                          onClick={() => startEdit(row.raw as never)}
                        >
                          {t('defects.edit')}
                        </button>
                        <button
                          type="button"
                          className={btnGhost}
                          style={{ borderColor: 'var(--border)' }}
                          disabled={busy}
                          onClick={() => void toggleActive(row.raw as never)}
                        >
                          {row.active ? t('common.deactivate') : t('common.activate')}
                        </button>
                        <button
                          type="button"
                          className={btnGhost}
                          style={{ borderColor: 'var(--border)' }}
                          disabled={busy}
                          onClick={() => void remove(row.id, row.usage)}
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside
          className="rounded-xl border bg-[var(--bg-surface-1)] p-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="mb-3 text-[15px] font-semibold">
            {editId == null ? t('defects.add') : t('defects.edit')}
          </h2>
          <div className="space-y-3">
            <label className="block text-[12px] text-[var(--text-secondary)]">
              {t('defects.colCode')}
              <input
                className={`${inputClass} mt-1`}
                style={{ borderColor: 'var(--border)' }}
                value={draft.code}
                onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
              />
            </label>
            <label className="block text-[12px] text-[var(--text-secondary)]">
              {t('defects.nameTr')}
              <input
                className={`${inputClass} mt-1`}
                style={{ borderColor: 'var(--border)' }}
                value={draft.name_tr}
                onChange={(e) => setDraft((d) => ({ ...d, name_tr: e.target.value }))}
              />
            </label>
            <label className="block text-[12px] text-[var(--text-secondary)]">
              {t('defects.nameEn')}
              <input
                className={`${inputClass} mt-1`}
                style={{ borderColor: 'var(--border)' }}
                value={draft.name_en}
                onChange={(e) => setDraft((d) => ({ ...d, name_en: e.target.value }))}
              />
            </label>
            {tab === 'parts' ? (
              <label className="block text-[12px] text-[var(--text-secondary)]">
                {t('defects.tabZones')}
                <select
                  className={`${inputClass} mt-1`}
                  style={{ borderColor: 'var(--border)' }}
                  value={draft.zone_id ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, zone_id: e.target.value ? Number(e.target.value) : undefined }))
                  }
                >
                  <option value="">{t('defects.pickZone')}</option>
                  {zones.map((z) => (
                    <option key={z.ID} value={z.ID}>
                      {z.Code} — {nameOf(z.NameTR, z.NameEN)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {tab === 'types' ? (
              <label className="block text-[12px] text-[var(--text-secondary)]">
                {t('defects.defaultProcess')}
                <select
                  className={`${inputClass} mt-1`}
                  style={{ borderColor: 'var(--border)' }}
                  value={draft.default_process_id ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      default_process_id: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                >
                  <option value="">{t('defects.noDefaultProcess')}</option>
                  {processes.map((p) => (
                    <option key={p.ID} value={p.ID}>
                      {p.Code} — {nameOf(p.NameTR, p.NameEN)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="inline-flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
              />
              {t('common.active')}
            </label>
            <div className="flex gap-2 pt-1">
              <button type="button" className={btnPrimary} disabled={busy} onClick={() => void save()}>
                {t('common.save')}
              </button>
              <button
                type="button"
                className={btnGhost}
                style={{ borderColor: 'var(--border)' }}
                disabled={busy}
                onClick={() => {
                  setEditId(null);
                  setDraft(emptyDraft());
                }}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
