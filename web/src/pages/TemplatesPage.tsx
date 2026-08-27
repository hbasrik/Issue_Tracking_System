import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  api,
  ApiError,
  type ChecklistTemplate,
  type ChecklistTemplateItem,
} from '../lib/api';
import { ActiveBadge } from '../components/ActiveBadge';
import { StatusBadge } from '../components/StatusBadge';
import {
  DataCard,
  DataCardField,
  DesktopTableShell,
  MobileCardStack,
} from '../components/DataCard';

function typeBadgeValue(type: ChecklistTemplate['Type']): string {
  if (type === 'EOL') return 'OK';
  if (type === 'TEST') return 'PENDING';
  return 'CONDITIONAL_OK';
}

function modelLabel(modelId: number | null): string {
  return modelId == null ? 'Default (all models)' : `Model #${modelId}`;
}

function activeCount(items: ChecklistTemplateItem[]): number {
  return items.filter((i) => i.IsActive).length;
}

const inputClass =
  'min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[15px]';
const btnPrimary =
  'min-h-touch rounded-lg bg-[var(--accent)] px-3 text-[13px] font-medium text-white disabled:opacity-40';
const btnGhost =
  'min-h-touch rounded-lg border px-3 text-[13px] disabled:opacity-40';

/** Checklist Templates admin — live catalogue, editable with admin.manage_masters. */
export default function TemplatesPage() {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [selected, setSelected] = useState<ChecklistTemplate | null>(null);
  const [items, setItems] = useState<ChecklistTemplateItem[]>([]);
  const [hideInactive, setHideInactive] = useState(false);
  const [draftText, setDraftText] = useState<Record<number, string>>({});
  const [draftPhase, setDraftPhase] = useState<Record<number, 'BRANCH' | 'DEPOT'>>({});
  const [newText, setNewText] = useState('');
  const [newPhase, setNewPhase] = useState<'BRANCH' | 'DEPOT'>('BRANCH');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadTemplates = useCallback(async () => {
    const res = await api.listChecklistTemplates();
    const list = res.items ?? [];
    setTemplates(list);
    return list;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [loadTemplates]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openEditor(row: ChecklistTemplate) {
    setSelected(row);
    setItems([]);
    setError(null);
    try {
      const res = await api.listChecklistTemplateItems(row.ID);
      const list = res.items ?? [];
      setItems(list);
      const texts: Record<number, string> = {};
      const phases: Record<number, 'BRANCH' | 'DEPOT'> = {};
      for (const item of list) {
        texts[item.ID] = item.ItemText;
        if (item.EolPhase === 'BRANCH' || item.EolPhase === 'DEPOT') {
          phases[item.ID] = item.EolPhase;
        }
      }
      setDraftText(texts);
      setDraftPhase(phases);
      setNewText('');
      setNewPhase('BRANCH');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load template items');
    }
  }

  async function refreshSelected(templateId: number) {
    const list = await loadTemplates();
    const row = list.find((t) => t.ID === templateId) ?? null;
    if (row) {
      await openEditor(row);
    }
  }

  const visible = useMemo(
    () => (hideInactive ? items.filter((i) => i.IsActive) : items),
    [hideInactive, items],
  );

  async function addItem() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.createChecklistTemplateItem(selected.ID, {
        ItemText: newText.trim(),
        EolPhase: selected.Type === 'EOL' ? newPhase : null,
      });
      setNewText('');
      await refreshSelected(selected.ID);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'add failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveItem(item: ChecklistTemplateItem) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const body: {
        ItemText?: string;
        EolPhase?: 'BRANCH' | 'DEPOT';
      } = { ItemText: (draftText[item.ID] ?? item.ItemText).trim() };
      if (selected.Type === 'EOL') {
        body.EolPhase = draftPhase[item.ID] ?? item.EolPhase ?? 'BRANCH';
      }
      await api.updateChecklistTemplateItem(selected.ID, item.ID, body);
      await refreshSelected(selected.ID);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'save failed');
    } finally {
      setBusy(false);
    }
  }

  async function setActive(item: ChecklistTemplateItem, isActive: boolean) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateChecklistTemplateItem(selected.ID, item.ID, {
        IsActive: isActive,
      });
      await refreshSelected(selected.ID);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'update failed');
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: ChecklistTemplateItem) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteChecklistTemplateItem(selected.ID, item.ID);
      await refreshSelected(selected.ID);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function move(item: ChecklistTemplateItem, dir: -1 | 1) {
    if (!selected) return;
    const idx = items.findIndex((i) => i.ID === item.ID);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= items.length) return;
    const next = items.slice();
    const tmp = next[idx];
    next[idx] = next[swap];
    next[swap] = tmp;
    setBusy(true);
    setError(null);
    try {
      const res = await api.reorderChecklistTemplateItems(
        selected.ID,
        next.map((i) => i.ID),
      );
      setItems(res.items ?? next);
      const list = await loadTemplates();
      const row = list.find((t) => t.ID === selected.ID);
      if (row) setSelected(row);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'reorder failed');
    } finally {
      setBusy(false);
    }
  }

  const liveActive = selected ? activeCount(items) : 0;

  return (
    <section>
      <h1 className="text-xl font-semibold sm:text-2xl">Checklist şablonları</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Multi-template admin — model × EOL / SHIPMENT / TEST. Yeni madde yalnızca
        bundan sonra eklenen araçlarda çıkar; silmek yerine pasife çekin.
      </p>
      {error && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <MobileCardStack
            empty={
              !loading && templates.length === 0 ? (
                <p className="text-[15px] text-[var(--text-secondary)]">No templates</p>
              ) : null
            }
          >
            {loading && (
              <p className="text-[var(--text-secondary)]">Yükleniyor…</p>
            )}
            {templates.map((row) => (
              <DataCard
                key={row.ID}
                selected={selected?.ID === row.ID}
                onClick={() => void openEditor(row)}
              >
                <DataCardField label="Model">
                  {modelLabel(row.VehicleModelID)}
                </DataCardField>
                <DataCardField label="Type">
                  <span className="inline-flex items-center gap-1">
                    <StatusBadge kind="eol" value={typeBadgeValue(row.Type)} />
                    {row.Type}
                  </span>
                </DataCardField>
                <DataCardField label="Aktif madde">{row.ItemCount}</DataCardField>
                <DataCardField label="Durum">
                  <ActiveBadge active={row.IsActive} />
                </DataCardField>
              </DataCard>
            ))}
          </MobileCardStack>

          <DesktopTableShell>
            <table className="w-full text-left text-[15px]">
              <thead>
                <tr
                  className="border-b text-[13px] text-[var(--text-secondary)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Aktif madde</th>
                  <th className="px-4 py-3">Durum</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="px-4 py-3 text-[var(--text-secondary)]" colSpan={4}>
                      Yükleniyor…
                    </td>
                  </tr>
                )}
                {!loading && templates.length === 0 && (
                  <tr>
                    <td className="px-4 py-3 text-[var(--text-secondary)]" colSpan={4}>
                      No templates
                    </td>
                  </tr>
                )}
                {templates.map((row) => (
                  <tr
                    key={row.ID}
                    className="cursor-pointer border-t hover:bg-[var(--bg-surface-2)]"
                    style={{ borderColor: 'var(--border)' }}
                    onClick={() => void openEditor(row)}
                  >
                    <td className="px-4 py-3">{modelLabel(row.VehicleModelID)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge kind="eol" value={typeBadgeValue(row.Type)} />{' '}
                      {row.Type}
                    </td>
                    <td className="px-4 py-3">{row.ItemCount}</td>
                    <td className="px-4 py-3">
                      <ActiveBadge active={row.IsActive} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DesktopTableShell>
        </div>

        <div
          className="rounded-xl border bg-[var(--bg-surface-1)] p-4 sm:p-5"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="text-lg font-semibold">Template editor</h2>
          {!selected && (
            <p className="mt-2 text-[15px] text-[var(--text-secondary)]">
              Select a template to edit items.
            </p>
          )}
          {selected && (
            <>
              <p className="mt-2 break-words text-[15px]">{selected.Name}</p>
              <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                {liveActive} aktif madde
                {items.length !== liveActive ? ` · ${items.length} toplam` : ''}
              </p>
              <label className="mt-3 flex min-h-touch items-center gap-2 text-[13px] text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={hideInactive}
                  onChange={(e) => setHideInactive(e.target.checked)}
                />
                Pasif maddeleri gizle
              </label>

              <div
                className="mt-4 space-y-2 rounded-lg border p-3"
                style={{ borderColor: 'var(--border)' }}
              >
                <p className="text-[13px] font-medium">Yeni madde</p>
                <input
                  className={inputClass}
                  style={{ borderColor: 'var(--border)' }}
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="Madde metni"
                  maxLength={250}
                />
                {selected.Type === 'EOL' ? (
                  <select
                    className={inputClass}
                    style={{ borderColor: 'var(--border)' }}
                    value={newPhase}
                    onChange={(e) =>
                      setNewPhase(e.target.value as 'BRANCH' | 'DEPOT')
                    }
                    aria-label="EoL phase"
                  >
                    <option value="BRANCH">BRANCH</option>
                    <option value="DEPOT">DEPOT</option>
                  </select>
                ) : null}
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={busy || !newText.trim()}
                  onClick={() => void addItem()}
                >
                  Ekle
                </button>
              </div>

              <ul className="mt-4 max-h-[32rem] space-y-3 overflow-auto">
                {visible.map((item, visIdx) => (
                  <li
                    key={item.ID}
                    className="rounded-lg border px-3 py-3"
                    style={{
                      borderColor: 'var(--border)',
                      opacity: item.IsActive ? 1 : 0.55,
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-2 w-8 shrink-0 text-[13px] text-[var(--text-secondary)]">
                        {item.ItemNo}.
                      </span>
                      <div className="min-w-0 flex-1 space-y-2">
                        {!item.IsActive ? (
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                            Pasif
                          </span>
                        ) : null}
                        <textarea
                          className={`${inputClass} py-2`}
                          style={{ borderColor: 'var(--border)', minHeight: 64 }}
                          value={draftText[item.ID] ?? item.ItemText}
                          onChange={(e) =>
                            setDraftText((prev) => ({
                              ...prev,
                              [item.ID]: e.target.value,
                            }))
                          }
                          maxLength={250}
                        />
                        {selected.Type === 'EOL' ? (
                          <select
                            className={inputClass}
                            style={{ borderColor: 'var(--border)' }}
                            value={
                              draftPhase[item.ID] ?? item.EolPhase ?? 'BRANCH'
                            }
                            onChange={(e) =>
                              setDraftPhase((prev) => ({
                                ...prev,
                                [item.ID]: e.target.value as 'BRANCH' | 'DEPOT',
                              }))
                            }
                            aria-label={`EoL phase for item ${item.ItemNo}`}
                          >
                            <option value="BRANCH">BRANCH</option>
                            <option value="DEPOT">DEPOT</option>
                          </select>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={btnPrimary}
                            disabled={busy}
                            onClick={() => void saveItem(item)}
                          >
                            Kaydet
                          </button>
                          <button
                            type="button"
                            className={btnGhost}
                            style={{ borderColor: 'var(--border)' }}
                            disabled={busy || visIdx === 0}
                            onClick={() => void move(item, -1)}
                            aria-label="Move up"
                          >
                            <ChevronUp size={16} />
                          </button>
                          <button
                            type="button"
                            className={btnGhost}
                            style={{ borderColor: 'var(--border)' }}
                            disabled={busy || visIdx === visible.length - 1}
                            onClick={() => void move(item, 1)}
                            aria-label="Move down"
                          >
                            <ChevronDown size={16} />
                          </button>
                          <button
                            type="button"
                            className={btnGhost}
                            style={{ borderColor: 'var(--border)' }}
                            disabled={busy}
                            onClick={() => void setActive(item, !item.IsActive)}
                          >
                            {item.IsActive ? 'Pasife çek' : 'Aktife al'}
                          </button>
                          <button
                            type="button"
                            className={btnGhost}
                            style={{
                              borderColor: 'var(--border)',
                              color: 'var(--status-not-ok)',
                            }}
                            disabled={busy}
                            onClick={() => void removeItem(item)}
                          >
                            Sil
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
