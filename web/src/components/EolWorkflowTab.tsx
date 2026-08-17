import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  api,
  ApiError,
  type BlockingIssue,
  type EOLStage,
  type EOLWorkflowView,
} from '../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { ChecklistPanel } from './ChecklistPanel';

const STAGES: { id: Exclude<EOLStage, 'COMPLETED'>; label: string }[] = [
  { id: 'BRANCH', label: 'Branch' },
  { id: 'DEPOT', label: 'Depot' },
  { id: 'DOCUMENT', label: 'Document' },
];

const STAGE_ORDER: EOLStage[] = ['BRANCH', 'DEPOT', 'DOCUMENT', 'COMPLETED'];

interface EolWorkflowTabProps {
  vin: string;
  onVehicleChanged: () => void;
}

/**
 * Vehicle Detail EoL tab: Branch → Depot → Document stepper, per-stage
 * checklist, and permission-gated actions (Karar 2).
 */
export function EolWorkflowTab({ vin, onVehicleChanged }: EolWorkflowTabProps) {
  const { isManager } = useAuth();
  const [workflow, setWorkflow] = useState<EOLWorkflowView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<BlockingIssue[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function resetWorkflow() {
    if (
      !window.confirm(
        'Reset this vehicle’s EoL workflow to Branch / IN_PRODUCTION? Test-only — not available outside development.',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setBlocking(null);
    try {
      await api.resetEOLWorkflow(vin);
      setWarning(null);
      await load();
      onVehicleChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'EoL reset failed');
    } finally {
      setBusy(false);
    }
  }

  const load = useCallback(async () => {
    setError(null);
    try {
      const view = await api.getEOLWorkflow(vin);
      setWorkflow(view);
      if (
        view.branch_open_issue_count_at_shipment &&
        view.branch_open_issue_count_at_shipment > 0 &&
        !view.depot_release.at
      ) {
        setWarning(
          `shipped with ${view.branch_open_issue_count_at_shipment} open issue(s) still unresolved`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load EoL workflow');
    }
  }, [vin]);

  useEffect(() => {
    void load();
  }, [load]);

  async function shipToDepot() {
    setBusy(true);
    setError(null);
    setBlocking(null);
    try {
      const out = await api.eolBranchShip(vin);
      if (out.warning || out.open_issue_count > 0) {
        setWarning(
          out.warning ||
            `shipped with ${out.open_issue_count} open issue(s) still unresolved`,
        );
      } else {
        setWarning(null);
      }
      await load();
      onVehicleChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'branch ship failed');
    } finally {
      setBusy(false);
    }
  }

  async function releaseFromDepot() {
    setBusy(true);
    setError(null);
    setBlocking(null);
    try {
      await api.eolDepotRelease(vin);
      setWarning(null);
      await load();
      onVehicleChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setBlocking(err.body.blocking_issues ?? []);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'depot release failed');
      }
    } finally {
      setBusy(false);
    }
  }

  async function approveDocument() {
    setBusy(true);
    setError(null);
    setBlocking(null);
    try {
      await api.eolDocumentApprove(vin);
      await load();
      onVehicleChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'document approval failed');
    } finally {
      setBusy(false);
    }
  }

  if (!workflow && error) {
    return (
      <p className="text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
        {error}
      </p>
    );
  }
  if (!workflow) {
    return <p className="text-[var(--text-secondary)]">Loading EoL…</p>;
  }

  const currentIndex = STAGE_ORDER.indexOf(workflow.current_stage);

  return (
    <div className="space-y-5">
      {warning && (
        <div
          className="rounded-xl border px-4 py-3 text-[15px]"
          style={{
            borderColor: 'var(--status-conditional-ok)',
            color: 'var(--status-conditional-ok)',
            backgroundColor:
              'color-mix(in srgb, var(--status-conditional-ok) 12%, transparent)',
          }}
          role="status"
        >
          {warning}
        </div>
      )}

      <div
        className="rounded-xl border bg-[var(--bg-surface-1)] p-5"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-lg font-semibold">EoL workflow</h2>
        {import.meta.env.DEV && (
          <div className="mt-3 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--status-conditional-ok)' }}>
            <p className="text-[13px]" style={{ color: 'var(--status-conditional-ok)' }}>
              Test-only tool — resets EoL to Branch and vehicle status to
              IN_PRODUCTION. Hidden and 404 outside APP_ENV=development.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void resetWorkflow()}
              className="mt-2 rounded-lg border px-3 py-1.5 text-[13px] disabled:opacity-60"
              style={{ borderColor: 'var(--border)' }}
            >
              Reset EoL Workflow
            </button>
          </div>
        )}
        <ol className="mt-4 flex items-center gap-2">
          {STAGES.map((stage, i) => {
            const done = i < currentIndex;
            const active = stage.id === workflow.current_stage;
            return (
              <li key={stage.id} className="flex flex-1 items-center gap-2">
                <div
                  className="flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-[13px] font-medium"
                  style={{
                    backgroundColor: done || active ? 'var(--accent)' : 'transparent',
                    color: done || active ? '#fff' : 'var(--text-secondary)',
                    outline: active
                      ? '2px solid var(--accent)'
                      : '1px solid var(--border)',
                    outlineOffset: active ? '2px' : 0,
                  }}
                >
                  {i + 1}. {stage.label}
                </div>
                {i < STAGES.length - 1 && (
                  <span
                    className="h-px flex-1"
                    style={{ backgroundColor: 'var(--border)' }}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <StageCard
        title="Branch"
        record={formatRecord(workflow.branch_ship)}
        actionLabel="Ship to Depot"
        actionEnabled={isManager && workflow.current_stage === 'BRANCH'}
        busy={busy}
        onAction={shipToDepot}
      >
        <ChecklistPanel
          vin={vin}
          type="eol"
          eolPhase="BRANCH"
          title="Branch checklist"
        />
      </StageCard>

      <StageCard
        title="Depot"
        record={formatRecord(workflow.depot_release)}
        actionLabel="Release from Depot"
        actionEnabled={isManager && workflow.current_stage === 'DEPOT'}
        busy={busy}
        onAction={releaseFromDepot}
      >
        <ChecklistPanel
          vin={vin}
          type="eol"
          eolPhase="DEPOT"
          title="Depot checklist"
        />
      </StageCard>

      <StageCard
        title="Document"
        record={formatRecord(workflow.document_approve)}
        actionLabel="Approve Document"
        actionEnabled={isManager && workflow.current_stage === 'DOCUMENT'}
        busy={busy}
        onAction={approveDocument}
      >
        <p className="text-[15px] text-[var(--text-secondary)]">
          Document approval has no checklist — it is the final sign-off after
          depot release.
        </p>
      </StageCard>

      {error && (
        <p className="text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      {blocking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="max-h-[80vh] w-full max-w-md overflow-auto rounded-xl border bg-[var(--bg-surface-1)] p-5"
            style={{ borderColor: 'var(--border)' }}
          >
            <h3 className="text-lg font-semibold" style={{ color: 'var(--status-not-ok)' }}>
              Depot release blocked
            </h3>
            <p className="mt-2 text-[15px] text-[var(--text-secondary)]">
              Open issues must be closed before release:
            </p>
            <ul className="mt-3 space-y-2 text-[15px]">
              {blocking.length === 0 && <li>No issue details returned</li>}
              {blocking.map((issue) => (
                <li key={issue.id} className="flex justify-between gap-3">
                  <span>Issue #{issue.id}</span>
                  <span className="text-[13px] text-[var(--text-secondary)]">
                    {issue.status} · {issue.severity}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-4 rounded-lg border px-4 py-2 text-[15px]"
              style={{ borderColor: 'var(--border)' }}
              onClick={() => setBlocking(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StageCard({
  title,
  record,
  actionLabel,
  actionEnabled,
  busy,
  onAction,
  children,
}: {
  title: string;
  record: string;
  actionLabel: string;
  actionEnabled: boolean;
  busy: boolean;
  onAction: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-medium">{title}</h3>
          <p className="text-[13px] text-[var(--text-secondary)]">{record}</p>
        </div>
        {actionEnabled && (
          <button
            type="button"
            disabled={busy}
            onClick={onAction}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[15px] text-white disabled:opacity-60"
          >
            {actionLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function formatRecord(record: EOLWorkflowView['branch_ship']): string {
  if (!record.at) return 'Not yet completed';
  const when = new Date(record.at).toLocaleString();
  return record.by_name ? `${when} · ${record.by_name}` : when;
}
