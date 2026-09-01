import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  api,
  ApiError,
  type BlockingIssue,
  type ChecklistItem,
  type EOLStage,
  type EOLWorkflowView,
} from '../lib/api';
import { apiErrorMessage } from '../lib/apiErrors';
import { useAuth } from '../auth/AuthProvider';
import { Perm } from '../auth/permissions';
import { useI18n } from '../i18n';
import { ChecklistPanel } from './ChecklistPanel';
import { SeverityIndicator } from './SeverityIndicator';
import { StatusBadge } from './StatusBadge';
import { ActionStamp } from './ActionStamp';

const STAGE_IDS: { id: Exclude<EOLStage, 'COMPLETED' | 'DOCUMENT'> }[] = [
  { id: 'BRANCH' },
  { id: 'DEPOT' },
];

const STAGE_ORDER: EOLStage[] = ['BRANCH', 'DEPOT', 'COMPLETED'];

function passing(status: ChecklistItem['Status']): boolean {
  return status === 'OK' || status === 'CONDITIONAL_OK';
}

function stepperStage(stage: EOLStage): EOLStage {
  return stage === 'DOCUMENT' ? 'COMPLETED' : stage;
}

function countRemaining(items: ChecklistItem[]): number {
  return items.filter((item) => !passing(item.Status)).length;
}

interface EolWorkflowTabProps {
  vin: string;
  onVehicleChanged: () => void;
}

/**
 * Vehicle Detail EoL tab: Şube → Depo → Teslim. Stage actions stay visible
 * while open and disable with per-checklist reasons until every gate passes.
 */
export function EolWorkflowTab({ vin, onVehicleChanged }: EolWorkflowTabProps) {
  const { has } = useAuth();
  const { t } = useI18n();
  const [workflow, setWorkflow] = useState<EOLWorkflowView | null>(null);
  const [eolItems, setEolItems] = useState<ChecklistItem[]>([]);
  const [testItems, setTestItems] = useState<ChecklistItem[]>([]);
  const [shipmentItems, setShipmentItems] = useState<ChecklistItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<BlockingIssue[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function resetWorkflow() {
    if (!window.confirm(t('eol.resetConfirm'))) {
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
      setError(err instanceof Error ? apiErrorMessage(err, t) : t('eol.resetFailed'));
    } finally {
      setBusy(false);
    }
  }

  const load = useCallback(async () => {
    setError(null);
    try {
      const [view, eol, test, shipment] = await Promise.all([
        api.getEOLWorkflow(vin),
        api.getVehicleChecklist(vin, 'eol'),
        api.getVehicleChecklist(vin, 'test'),
        api.getVehicleChecklist(vin, 'shipment'),
      ]);
      setWorkflow(view);
      setEolItems(eol.items ?? []);
      setTestItems(test.items ?? []);
      setShipmentItems(shipment.items ?? []);
      if (
        view.branch_open_issue_count_at_shipment &&
        view.branch_open_issue_count_at_shipment > 0 &&
        !view.depot_release.at
      ) {
        setWarning(
          t('eol.shippedOpen', { n: view.branch_open_issue_count_at_shipment }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? apiErrorMessage(err, t) : t('eol.loadFailed'));
    }
  }, [vin, t]);

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
          out.warning || t('eol.shippedOpen', { n: out.open_issue_count }),
        );
      } else {
        setWarning(null);
      }
      await load();
      onVehicleChanged();
    } catch (err) {
      setError(err instanceof Error ? apiErrorMessage(err, t) : t('eol.branchShipFailed'));
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
        setError(apiErrorMessage(err, t));
      } else {
        setError(err instanceof Error ? apiErrorMessage(err, t) : t('eol.depotReleaseFailed'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function markDelivered() {
    setBusy(true);
    setError(null);
    try {
      await api.eolDeliver(vin);
      await load();
      onVehicleChanged();
    } catch (err) {
      setError(err instanceof Error ? apiErrorMessage(err, t) : t('eol.deliverFailed'));
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
    return <p className="text-[var(--text-secondary)]">{t('eol.loading')}</p>;
  }

  const currentIndex = STAGE_ORDER.indexOf(stepperStage(workflow.current_stage));
  const branchItems = eolItems.filter((item) => item.EolPhase === 'BRANCH');
  const depotItems = eolItems.filter((item) => item.EolPhase === 'DEPOT');
  const branchRemaining = countRemaining(branchItems);
  const testRemaining = countRemaining(testItems);
  const shipmentRemaining = countRemaining(shipmentItems);
  const depotRemaining = countRemaining(depotItems);
  const depotLocked = branchRemaining > 0;

  const canShip =
    has(Perm.EOLBranchShip) &&
    workflow.current_stage === 'BRANCH' &&
    branchRemaining === 0 &&
    testRemaining === 0 &&
    shipmentRemaining === 0;
  const shipDisabledReasons: string[] = [];
  if (!has(Perm.EOLBranchShip)) {
    shipDisabledReasons.push(t('eol.forbidden'));
  } else if (workflow.current_stage !== 'BRANCH') {
    shipDisabledReasons.push(t('eol.needBranchShip'));
  } else {
    if (branchRemaining > 0) {
      shipDisabledReasons.push(t('eol.branchRemaining', { n: branchRemaining }));
    }
    if (testRemaining > 0) {
      shipDisabledReasons.push(t('eol.branchBlockerTest', { n: testRemaining }));
    }
    if (shipmentRemaining > 0) {
      shipDisabledReasons.push(t('eol.branchBlockerShipment', { n: shipmentRemaining }));
    }
  }

  const canRelease =
    has(Perm.EOLDepotRelease) &&
    Boolean(workflow.branch_ship.at) &&
    workflow.current_stage === 'DEPOT' &&
    depotRemaining === 0;
  const releaseDisabledReasons: string[] = [];
  if (!has(Perm.EOLDepotRelease)) {
    releaseDisabledReasons.push(t('eol.forbidden'));
  } else if (!workflow.branch_ship.at) {
    releaseDisabledReasons.push(t('eol.needBranchShip'));
  } else if (depotRemaining > 0) {
    releaseDisabledReasons.push(t('eol.depotRemaining', { n: depotRemaining }));
  }

  const canDeliver =
    has(Perm.EOLDeliver) &&
    Boolean(workflow.depot_release.at) &&
    !workflow.deliver?.at;
  const deliverDisabledReasons: string[] = [];
  if (!has(Perm.EOLDeliver)) {
    deliverDisabledReasons.push(t('eol.forbidden'));
  } else if (!workflow.depot_release.at) {
    deliverDisabledReasons.push(t('eol.needDepotRelease'));
  }

  const stages = STAGE_IDS.map((stage) => ({
    ...stage,
    label: stage.id === 'BRANCH' ? t('checklist.branch') : t('checklist.depot'),
  }));

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
        className="rounded-xl border bg-[var(--bg-surface-1)] p-4 sm:p-5"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-lg font-semibold">{t('eol.title')}</h2>
        {import.meta.env.DEV && (
          <div className="mt-3 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--status-conditional-ok)' }}>
            <p className="text-[13px]" style={{ color: 'var(--status-conditional-ok)' }}>
              {t('eol.resetHint')}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void resetWorkflow()}
              className="mt-2 min-h-touch rounded-lg border px-3 text-[13px] disabled:opacity-60"
              style={{ borderColor: 'var(--border)' }}
            >
              {t('eol.resetButton')}
            </button>
          </div>
        )}
        <ol className="mt-4 flex flex-wrap items-center gap-2">
          {stages.map((stage, i) => {
            const done = i < currentIndex;
            const active = stage.id === stepperStage(workflow.current_stage);
            return (
              <li key={stage.id} className="flex min-w-0 flex-1 basis-[30%] items-center gap-2">
                <div
                  className="flex min-h-touch min-w-9 items-center justify-center rounded-full px-2 text-[12px] font-medium sm:px-3 sm:text-[13px]"
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
                {i < stages.length - 1 && (
                  <span
                    className="hidden h-px flex-1 sm:block"
                    style={{ backgroundColor: 'var(--border)' }}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <StageCard
        title={t('checklist.shipFromBranch')}
        name={workflow.branch_ship.by_name}
        at={workflow.branch_ship.at}
        actionLabel={t('eol.shipBranch')}
        showAction={!workflow.branch_ship.at}
        actionEnabled={canShip}
        actionDisabledReasons={shipDisabledReasons}
        busy={busy}
        onAction={shipToDepot}
      >
        <ChecklistPanel
          vin={vin}
          type="eol"
          eolPhase="BRANCH"
          title={t('checklist.branchTitle')}
          items={eolItems}
          onReload={load}
        />
      </StageCard>

      <StageCard
        title={t('checklist.releaseFromDepot')}
        name={workflow.depot_release.by_name}
        at={workflow.depot_release.at}
        actionLabel={t('eol.releaseDepot')}
        showAction={!workflow.depot_release.at}
        actionEnabled={canRelease}
        actionDisabledReasons={releaseDisabledReasons}
        busy={busy}
        onAction={releaseFromDepot}
      >
        <ChecklistPanel
          vin={vin}
          type="eol"
          eolPhase="DEPOT"
          title={t('checklist.depotTitle')}
          items={eolItems}
          onReload={load}
          locked={depotLocked}
          lockHint={t('checklist.lockHint')}
        />
      </StageCard>

      <StageCard
        title={t('eol.deliver')}
        name={workflow.deliver?.by_name}
        at={workflow.deliver?.at ?? null}
        actionLabel={t('eol.deliver')}
        showAction={Boolean(workflow.depot_release.at) && !workflow.deliver?.at}
        actionEnabled={canDeliver}
        actionDisabledReasons={deliverDisabledReasons}
        busy={busy}
        onAction={markDelivered}
      />

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
              {t('eol.depotBlocked')}
            </h3>
            <p className="mt-2 text-[15px] text-[var(--text-secondary)]">
              {t('eol.depotBlockedHint')}
            </p>
            <ul className="mt-3 space-y-2 text-[15px]">
              {blocking.length === 0 && <li>{t('eol.noIssueDetails')}</li>}
              {blocking.map((issue) => (
                <li key={issue.id} className="flex items-center justify-between gap-3">
                  <span>{t('eol.issueN', { id: issue.id })}</span>
                  <span className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
                    <SeverityIndicator severity={issue.severity} />
                    <StatusBadge kind="issue" value={issue.status} />
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
              {t('common.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StageCard({
  title,
  name,
  at,
  actionLabel,
  showAction,
  actionEnabled,
  actionDisabledReasons,
  busy,
  onAction,
  children,
}: {
  title: string;
  name?: string;
  at: string | null;
  actionLabel: string;
  showAction: boolean;
  actionEnabled: boolean;
  actionDisabledReasons?: string[];
  busy: boolean;
  onAction: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-medium">{title}</h3>
          <ActionStamp name={name} at={at} />
        </div>
        {showAction && (
          <div className="max-w-xs text-right">
            <button
              type="button"
              disabled={busy || !actionEnabled}
              onClick={onAction}
              className="min-h-touch rounded-lg bg-[var(--accent)] px-4 text-[15px] text-white disabled:opacity-60"
            >
              {actionLabel}
            </button>
            {!actionEnabled && actionDisabledReasons && actionDisabledReasons.length > 0 ? (
              <ul className="mt-1 space-y-0.5 text-[12px] text-[var(--text-secondary)]">
                {actionDisabledReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
