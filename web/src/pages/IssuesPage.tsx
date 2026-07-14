import { useState } from 'react';
import { StatusBadge } from '../components/StatusBadge';

/** Issues list + detail shell — §2.1 / §4. Issues close/approve is Manager-only. */
export default function IssuesPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Placeholder rows until a dedicated GET /issues endpoint exists.
  const rows = [
    {
      id: 1,
      vin: 'KAREATEST00000057',
      severity: 'CRITICAL',
      status: 'OPEN',
      station: 'Phase 1 Station',
      description: 'Sample open issue (seed placeholder)',
    },
    {
      id: 2,
      vin: 'KAREATEST00000057',
      severity: 'MEDIUM',
      status: 'DONE',
      station: 'EoL Bay',
      description: 'Awaiting quality approval',
    },
  ];

  const filtered = statusFilter
    ? rows.filter((r) => r.status === statusFilter)
    : rows;
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  return (
    <section>
      <h1 className="text-2xl font-semibold">Issues</h1>
      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
        Issue list and detail — quality approval (DONE → APPROVED) is Manager-only
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border bg-[var(--bg-surface-1)] px-3 py-2 text-[15px]"
          style={{ borderColor: 'var(--border)' }}
        >
          <option value="">All statuses</option>
          <option value="OPEN">OPEN</option>
          <option value="IN_PROGRESS">IN_PROGRESS</option>
          <option value="DONE">DONE</option>
          <option value="APPROVED">APPROVED</option>
        </select>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">VIN</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-t hover:bg-[var(--bg-surface-2)]"
                  style={{ borderColor: 'var(--border)' }}
                  onClick={() => setSelectedId(r.id)}
                >
                  <td className="px-4 py-3">#{r.id}</td>
                  <td className="px-4 py-3">…{r.vin.slice(-5)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge kind="severity" value={r.severity} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge kind="issue" value={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t px-4 py-2 text-[12px] text-[var(--text-secondary)]"
            style={{ borderColor: 'var(--border)' }}>
            Placeholder rows — wire to GET /issues when available.
          </p>
        </div>

        <div
          className="rounded-xl border bg-[var(--bg-surface-1)] p-5"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="text-lg font-semibold">Issue detail</h2>
          {!selected && (
            <p className="mt-2 text-[15px] text-[var(--text-secondary)]">
              Select an issue from the list.
            </p>
          )}
          {selected && (
            <div className="mt-4 space-y-3 text-[15px]">
              <p>
                <span className="text-[var(--text-secondary)]">VIN:</span>{' '}
                {selected.vin}
              </p>
              <p>
                <span className="text-[var(--text-secondary)]">Station:</span>{' '}
                {selected.station}
              </p>
              <p>{selected.description}</p>
              <div className="flex gap-2">
                <StatusBadge kind="severity" value={selected.severity} />
                <StatusBadge kind="issue" value={selected.status} />
              </div>
              {selected.status === 'DONE' && (
                <button
                  type="button"
                  className="mt-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-white"
                  title="PATCH /issues/:id/status with APPROVED"
                >
                  Approve (quality sign-off)
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
