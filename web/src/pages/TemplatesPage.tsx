import { useState } from 'react';
import { StatusBadge } from '../components/StatusBadge';

interface TemplateRow {
  id: number;
  model: string;
  type: 'EOL' | 'SHIPMENT';
  name: string;
  itemCount: number;
  isActive: boolean;
}

const SEED: TemplateRow[] = [
  {
    id: 1,
    model: 'Default (all models)',
    type: 'EOL',
    name: 'Default EoL Template (13 items)',
    itemCount: 13,
    isActive: true,
  },
  {
    id: 2,
    model: 'Default (all models)',
    type: 'SHIPMENT',
    name: 'Default Shipment Template (43 items)',
    itemCount: 43,
    isActive: true,
  },
];

/** Checklist Templates admin — §4.5 list + editor shell. */
export default function TemplatesPage() {
  const [selected, setSelected] = useState<TemplateRow | null>(null);
  const [items, setItems] = useState<string[]>([]);

  function openEditor(row: TemplateRow) {
    setSelected(row);
    // Placeholder item text until a templates API exists.
    setItems(
      Array.from({ length: row.itemCount }, (_, i) => `Item ${i + 1}`),
    );
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold">Checklist Templates</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Multi-template admin — model × EOL / SHIPMENT
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div
          className="overflow-hidden rounded-xl border bg-[var(--bg-surface-1)]"
          style={{ borderColor: 'var(--border)' }}
        >
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
              {SEED.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t hover:bg-[var(--bg-surface-2)]"
                  style={{ borderColor: 'var(--border)' }}
                  onClick={() => openEditor(row)}
                >
                  <td className="px-4 py-3">{row.model}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      kind="eol"
                      value={row.type === 'EOL' ? 'OK' : 'CONDITIONAL_OK'}
                    />{' '}
                    {row.type}
                  </td>
                  <td className="px-4 py-3">{row.itemCount}</td>
                  <td className="px-4 py-3">
                    {row.isActive ? 'Active' : 'Inactive'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          className="rounded-xl border bg-[var(--bg-surface-1)] p-5"
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
              <p className="mt-2 text-[15px]">{selected.name}</p>
              <ul className="mt-4 max-h-80 space-y-2 overflow-auto">
                {items.map((text, idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[15px]"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <span className="text-[var(--text-secondary)]">{idx + 1}.</span>
                    <input
                      value={text}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = e.target.value;
                        setItems(next);
                      }}
                      className="flex-1 bg-transparent outline-none"
                    />
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-4 rounded-lg border px-3 py-2 text-[15px]"
                style={{ borderColor: 'var(--border)' }}
                onClick={() => setItems((prev) => [...prev, `Item ${prev.length + 1}`])}
              >
                Add item
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
