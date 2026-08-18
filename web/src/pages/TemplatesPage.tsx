import { useCallback, useEffect, useState } from 'react';
import { api, type ChecklistTemplate, type ChecklistTemplateItem } from '../lib/api';
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

/** Checklist Templates admin — live catalogue from GET /checklist-templates. */
export default function TemplatesPage() {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [selected, setSelected] = useState<ChecklistTemplate | null>(null);
  const [items, setItems] = useState<ChecklistTemplateItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listChecklistTemplates();
      setTemplates(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openEditor(row: ChecklistTemplate) {
    setSelected(row);
    setItems([]);
    try {
      const res = await api.listChecklistTemplateItems(row.ID);
      setItems(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load template items');
    }
  }

  return (
    <section>
      <h1 className="text-xl font-semibold sm:text-2xl">Checklist Templates</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Multi-template admin — model × EOL / SHIPMENT / TEST
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
              <p className="text-[var(--text-secondary)]">Loading…</p>
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
                <DataCardField label="Items">{row.ItemCount}</DataCardField>
                <DataCardField label="Status">
                  {row.IsActive ? 'Active' : 'Inactive'}
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
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="px-4 py-3 text-[var(--text-secondary)]" colSpan={4}>
                      Loading…
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
                      {row.IsActive ? 'Active' : 'Inactive'}
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
              Select a template to view items.
            </p>
          )}
          {selected && (
            <>
              <p className="mt-2 break-words text-[15px]">{selected.Name}</p>
              <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                {selected.ItemCount} live items — edits are not saved from this
                screen yet
              </p>
              <ul className="mt-4 max-h-80 space-y-2 overflow-auto">
                {items.map((item) => (
                  <li
                    key={item.ID}
                    className="flex min-h-touch items-center gap-2 rounded-lg border px-3 py-2 text-[15px]"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <span className="text-[var(--text-secondary)]">{item.ItemNo}.</span>
                    <span className="min-w-0 flex-1 break-words">{item.ItemText}</span>
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
