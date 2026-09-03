import { Printer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n';
import { api, type ChecklistItem, type ChecklistType, type EOLWorkflowView, type Vehicle } from '../../lib/api';
import { checklistActorLines } from '../../lib/actionStamp';
import { formatDateTime } from '../../../../shared/i18n';
import { printSection } from '../../lib/print';
import {
  checklistStatusLabel,
  eolStageLabel,
  vehicleStatusLabel,
} from '../../lib/vehicleStatus';
import { PrintButton, PrintHeader, PrintRoot } from './PrintRoot';

function itemNotes(item: ChecklistItem): string {
  return [item.ReworkDesc, item.ConditionalDesc, item.RejectedDesc]
    .map((s) => s?.trim())
    .find(Boolean) ?? '';
}

function checklistTitleKey(type: ChecklistType): 'print.checklistEol' | 'print.checklistShipment' | 'print.checklistTest' {
  if (type === 'shipment') return 'print.checklistShipment';
  if (type === 'test') return 'print.checklistTest';
  return 'print.checklistEol';
}

export function ChecklistPrint({
  vin,
  type,
  items,
}: {
  vin: string;
  type: ChecklistType;
  items: ChecklistItem[];
}) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [workflow, setWorkflow] = useState<EOLWorkflowView | null>(null);

  const printId = `checklist-${type}`;

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api.getVehicle(vin),
      api.getEOLWorkflow(vin).catch(() => null),
    ]).then(([v, wf]) => {
      if (cancelled) return;
      setVehicle(v);
      setWorkflow(wf);
    });
    return () => {
      cancelled = true;
    };
  }, [vin]);

  const groups = useMemo(() => {
    if (type !== 'eol') {
      return [{ title: null as string | null, items: [...items].sort((a, b) => a.ItemNo - b.ItemNo) }];
    }
    const branch = items
      .filter((it) => it.EolPhase === 'BRANCH' || !it.EolPhase)
      .sort((a, b) => a.ItemNo - b.ItemNo);
    const depot = items
      .filter((it) => it.EolPhase === 'DEPOT')
      .sort((a, b) => a.ItemNo - b.ItemNo);
    return [
      { title: t('print.phaseBranch'), items: branch },
      { title: t('print.phaseDepot'), items: depot },
    ];
  }, [items, type, t]);

  const [printedAt, setPrintedAt] = useState(() =>
    formatDateTime(new Date().toISOString(), locale),
  );

  async function onPrint() {
    flushSync(() => setPrintedAt(formatDateTime(new Date().toISOString(), locale)));
    await printSection(printId);
  }

  return (
    <>
      <PrintButton label={t('common.print')} icon={<Printer size={15} aria-hidden />} onClick={() => void onPrint()} />
      <PrintRoot id={printId}>
        <PrintHeader
          title={t(checklistTitleKey(type))}
          meta={[
            { label: t('print.vin'), value: vin },
            {
              label: t('print.vehicleStatus'),
              value: vehicle
                ? vehicleStatusLabel(vehicle.CurrentGlobalStatus, t)
                : t('common.emDash'),
            },
            {
              label: t('print.eolStage'),
              value: workflow
                ? eolStageLabel(workflow.current_stage, t)
                : t('common.emDash'),
            },
            { label: t('print.printedAt'), value: printedAt },
            {
              label: t('print.printedBy'),
              value: user?.FullName?.trim() || t('common.emDash'),
            },
          ]}
        />
        {groups.map((group) => (
          <section key={group.title ?? 'all'} className="print-section">
            {group.title ? <h2>{group.title}</h2> : null}
            {group.items.length === 0 ? (
              <p>{t('print.noItems')}</p>
            ) : (
              group.items.map((item) => {
                const notes = itemNotes(item);
                const stamps = checklistActorLines(item, t, locale);
                return (
                  <article key={item.ItemID} className="print-item">
                    <p className="print-item-title">
                      {item.ItemNo}. {item.ItemText}
                    </p>
                    <p>
                      {t('print.itemStatus')}:{' '}
                      <span className="print-item-status">
                        {checklistStatusLabel(item.Status, t)}
                      </span>
                    </p>
                    {notes ? (
                      <p>
                        {t('print.itemNotes')}: {notes}
                      </p>
                    ) : null}
                    {stamps.length > 0 ? (
                      <p>
                        {t('print.actor')}: {stamps.join(' · ')}
                      </p>
                    ) : null}
                  </article>
                );
              })
            )}
          </section>
        ))}
      </PrintRoot>
    </>
  );
}
