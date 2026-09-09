import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  api,
  ApiError,
  type ChecklistTemplate,
  type ChecklistTemplateItem,
} from '../lib/api';
import { apiErrorMessage } from '../lib/apiErrors';
import { ActiveBadge } from '../components/ActiveBadge';
import { useConfirm } from '../components/ConfirmDialog';
import {
  DataCard,
  DataCardField,
  DesktopTableShell,
  MobileCardStack,
} from '../components/DataCard';
import { useI18n, type Translate } from '../i18n';
import { brandColors, inkOn, mixTowardBlack } from '../theme/tokens';

/** Checklist catalogue type — not an item/issue status. */
function templateTypeLabel(
  type: ChecklistTemplate['Type'],
  t: Translate,
): string {
  switch (type) {
    case 'EOL':
      return t('templates.typeEol');
    case 'SHIPMENT':
      return t('templates.typeShipment');
    case 'TEST':
      return t('templates.typeTest');
    default:
      return type;
  }
}

/** Neutral chip — never StatusBadge / checklist / issue colors. */
function TemplateTypeBadge({ type }: { type: ChecklistTemplate['Type'] }) {
  const { t } = useI18n();
  const color = mixTowardBlack(brandColors.neutralGray, 18);
  const ink = inkOn(color);
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium"
      style={{ color: ink, backgroundColor: color }}
    >
      {templateTypeLabel(type, t)}
    </span>
  );
}

function modelLabel(modelId: number | null, t: Translate): string {
  return modelId == null ? t('common.defaultAllModels') : t('common.modelN', { id: modelId });
}

function activeCount(items: ChecklistTemplateItem[]): number {
  return items.filter((i) => i.IsActive).length;
}

const inputClass =
  'min-h-touch w-full rounded-lg border bg-[var(--bg-page)] px-3 text-[15px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';
const btnPrimary =
  'min-h-touch rounded-lg bg-[var(--accent)] px-3 text-[13px] font-medium text-white hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-40';
const btnGhost =
  'min-h-touch rounded-lg border px-3 text-[13px] hover:bg-[var(--bg-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-40';
const btnActivate =
  'min-h-touch rounded-lg px-3 text-[13px] font-semibold text-white hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--status-ok)] disabled:opacity-40';
const btnDeactivate =
  'min-h-touch rounded-lg border px-3 text-[13px] font-semibold hover:bg-[var(--bg-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--status-conditional-ok)] disabled:opacity-40';

/** Checklist Templates admin — live catalogue, editable with admin.manage_masters. */
export default function TemplatesPage() {
  const { t } = useI18n();
  const confirm = useConfirm();
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
      setError(err instanceof Error ? apiErrorMessage(err, t) : t('templates.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [loadTemplates, t]);

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
      setError(err instanceof Error ? apiErrorMessage(err, t) : t('templates.itemsFailed'));
    }
  }

  async function refreshSelected(templateId: number) {
    const list = await loadTemplates();
    const row = list.find((tmpl) => tmpl.ID === templateId) ?? null;
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
      const impact = await api.previewChecklistTemplateItemImpact(selected.ID, 'create');
      const ok = await confirm({
        title: t('templates.confirmCreateTitle'),
        message: t('templates.confirmCreate', {
          affected: impact.Affected,
          protected: impact.Protected,
        }),
      });
      if (!ok) return;
      await api.createChecklistTemplateItem(selected.ID, {
        ItemText: newText.trim(),
        EolPhase: selected.Type === 'EOL' ? newPhase : null,
      });
      setNewText('');
      await refreshSelected(selected.ID);
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err, t) : t('templates.addFailed'));
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
      setError(err instanceof ApiError ? apiErrorMessage(err, t) : t('templates.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function setActive(item: ChecklistTemplateItem, isActive: boolean) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const action = isActive ? 'activate' : 'deactivate';
      const impact = await api.previewChecklistTemplateItemImpact(
        selected.ID,
        action,
        item.ID,
      );
      const ok = await confirm({
        title: isActive
          ? t('templates.confirmActivateTitle')
          : t('templates.confirmDeactivateTitle'),
        message: isActive
          ? t('templates.confirmActivate', {
              affected: impact.Affected,
              protected: impact.Protected,
            })
          : t('templates.confirmDeactivate', {
              affected: impact.Affected,
              protected: impact.Protected,
            }),
        tone: isActive ? 'default' : 'warning',
      });
      if (!ok) return;
      await api.updateChecklistTemplateItem(selected.ID, item.ID, {
        IsActive: isActive,
      });
      await refreshSelected(selected.ID);
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err, t) : t('templates.updateFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: ChecklistTemplateItem) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const impact = await api.previewChecklistTemplateItemImpact(
        selected.ID,
        'delete',
        item.ID,
      );
      if (impact.Protected > 0) {
        const message = t('templates.deleteBlocked', {
          protected: impact.Protected,
        });
        setError(message);
        await confirm({
          mode: 'alert',
          title: t('templates.confirmDeleteTitle'),
          message,
          tone: 'warning',
        });
        return;
      }
      const ok = await confirm({
        title: t('templates.confirmDeleteTitle'),
        message: t('templates.confirmDelete', { affected: impact.Affected }),
        confirmLabel: t('common.confirmDelete'),
        tone: 'danger',
      });
      if (!ok) return;
      await api.deleteChecklistTemplateItem(selected.ID, item.ID);
      await refreshSelected(selected.ID);
      setError(null);
    } catch (err) {
      const message =
        err instanceof ApiError ? apiErrorMessage(err, t) : t('templates.deleteFailed');
      setError(message);
      await confirm({
        mode: 'alert',
        title: t('templates.confirmDeleteTitle'),
        message,
        tone: 'danger',
      });
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
      const row = list.find((tmpl) => tmpl.ID === selected.ID);
      if (row) setSelected(row);
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err, t) : t('templates.reorderFailed'));
    } finally {
      setBusy(false);
    }
  }

  const liveActive = selected ? activeCount(items) : 0;

  return (
    <section>
      <h1 className="text-xl font-semibold sm:text-2xl">{t('templates.title')}</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        {t('templates.hint')}
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
                <p className="text-[15px] text-[var(--text-secondary)]">{t('templates.empty')}</p>
              ) : null
            }
          >
            {loading && (
              <p className="text-[var(--text-secondary)]">{t('common.loading')}</p>
            )}
            {templates.map((row) => (
              <DataCard
                key={row.ID}
                selected={selected?.ID === row.ID}
                onClick={() => void openEditor(row)}
              >
                <DataCardField label={t('templates.model')}>
                  {modelLabel(row.VehicleModelID, t)}
                </DataCardField>
                <DataCardField label={t('templates.type')}>
                  <TemplateTypeBadge type={row.Type} />
                </DataCardField>
                <DataCardField label={t('templates.activeItems')}>{row.ItemCount}</DataCardField>
                <DataCardField label={t('templates.status')}>
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
                  <th className="px-4 py-3">{t('templates.model')}</th>
                  <th className="px-4 py-3">{t('templates.type')}</th>
                  <th className="px-4 py-3">{t('templates.activeItems')}</th>
                  <th className="px-4 py-3">{t('templates.status')}</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="px-4 py-3 text-[var(--text-secondary)]" colSpan={4}>
                      {t('common.loading')}
                    </td>
                  </tr>
                )}
                {!loading && templates.length === 0 && (
                  <tr>
                    <td className="px-4 py-3 text-[var(--text-secondary)]" colSpan={4}>
                      {t('templates.empty')}
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
                    <td className="px-4 py-3">{modelLabel(row.VehicleModelID, t)}</td>
                    <td className="px-4 py-3">
                      <TemplateTypeBadge type={row.Type} />
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
          <h2 className="text-lg font-semibold">{t('templates.editor')}</h2>
          {!selected && (
            <p className="mt-2 text-[15px] text-[var(--text-secondary)]">
              {t('templates.pick')}
            </p>
          )}
          {selected && (
            <>
              <p className="mt-2 break-words text-[15px]">{selected.Name}</p>
              <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                {t('templates.activeCount', { n: liveActive })}
                {items.length !== liveActive ? t('templates.totalItems', { n: items.length }) : ''}
              </p>
              <label className="mt-3 flex min-h-touch items-center gap-2 text-[13px] text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={hideInactive}
                  onChange={(e) => setHideInactive(e.target.checked)}
                />
                {t('templates.hideInactive')}
              </label>

              <div
                className="mt-4 space-y-2 rounded-lg border p-3"
                style={{ borderColor: 'var(--border)' }}
              >
                <p className="text-[13px] font-medium">{t('templates.newItem')}</p>
                <input
                  className={inputClass}
                  style={{ borderColor: 'var(--border)' }}
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder={t('templates.itemText')}
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
                    aria-label={t('templates.eolPhase')}
                  >
                    <option value="BRANCH">{t('templates.branch')}</option>
                    <option value="DEPOT">{t('templates.depot')}</option>
                  </select>
                ) : null}
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={busy || !newText.trim()}
                  onClick={() => void addItem()}
                >
                  {t('common.add')}
                </button>
              </div>

              <ul className="mt-4 max-h-[32rem] space-y-3 overflow-auto">
                {visible.map((item, visIdx) => (
                  <li
                    key={item.ID}
                    className="rounded-lg border px-3 py-3"
                    style={{
                      borderColor: item.IsActive
                        ? 'var(--border)'
                        : 'color-mix(in srgb, var(--text-secondary) 45%, var(--border))',
                      backgroundColor: item.IsActive
                        ? undefined
                        : 'color-mix(in srgb, var(--bg-surface-2) 70%, transparent)',
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className="mt-2 w-8 shrink-0 text-[13px] text-[var(--text-secondary)]"
                        style={{ opacity: item.IsActive ? 1 : 0.65 }}
                      >
                        {item.ItemNo}.
                      </span>
                      <div className="min-w-0 flex-1 space-y-2">
                        <ActiveBadge active={item.IsActive} />
                        <div
                          className="space-y-2"
                          style={{ opacity: item.IsActive ? 1 : 0.55 }}
                        >
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
                              aria-label={t('templates.eolPhaseItem', { n: item.ItemNo })}
                            >
                              <option value="BRANCH">{t('templates.branch')}</option>
                              <option value="DEPOT">{t('templates.depot')}</option>
                            </select>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2" style={{ opacity: 1 }}>
                          <button
                            type="button"
                            className={btnPrimary}
                            disabled={busy}
                            onClick={() => void saveItem(item)}
                          >
                            {t('common.save')}
                          </button>
                          <button
                            type="button"
                            className={btnGhost}
                            style={{ borderColor: 'var(--border)' }}
                            disabled={busy || visIdx === 0}
                            onClick={() => void move(item, -1)}
                            aria-label={t('common.moveUp')}
                          >
                            <ChevronUp size={16} />
                          </button>
                          <button
                            type="button"
                            className={btnGhost}
                            style={{ borderColor: 'var(--border)' }}
                            disabled={busy || visIdx === visible.length - 1}
                            onClick={() => void move(item, 1)}
                            aria-label={t('common.moveDown')}
                          >
                            <ChevronDown size={16} />
                          </button>
                          {item.IsActive ? (
                            <button
                              type="button"
                              className={btnDeactivate}
                              style={{
                                borderColor: 'var(--status-conditional-ok)',
                                color: 'var(--status-conditional-ok)',
                              }}
                              disabled={busy}
                              onClick={() => void setActive(item, false)}
                            >
                              {t('common.deactivate')}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={btnActivate}
                              style={{ backgroundColor: 'var(--status-ok)' }}
                              disabled={busy}
                              onClick={() => void setActive(item, true)}
                            >
                              {t('common.activate')}
                            </button>
                          )}
                          <button
                            type="button"
                            className={btnGhost}
                            style={{
                              borderColor: 'var(--status-not-ok)',
                              color: 'var(--status-not-ok)',
                            }}
                            disabled={busy}
                            onClick={() => void removeItem(item)}
                          >
                            {t('common.delete')}
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
