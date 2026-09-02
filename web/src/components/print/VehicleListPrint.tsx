import { useState } from 'react';
import { flushSync } from 'react-dom';
import { formatDateTime } from '../../../../shared/i18n';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n';
import type { Vehicle } from '../../lib/api';
import { printSection } from '../../lib/print';
import { vehicleListStatusLine } from '../../lib/vehicleStatus';
import { PrintButton, PrintHeader, PrintRoot } from './PrintRoot';

export type VehiclePrintBundle = {
  vehicles: Vehicle[];
  filters: string[];
  stationName: (id: number | null) => string;
  openIssueCount: (vin: string) => number;
};

export function VehicleListPrint({
  disabled,
  onCollect,
}: {
  disabled?: boolean;
  onCollect: () => Promise<VehiclePrintBundle>;
}) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [bundle, setBundle] = useState<VehiclePrintBundle | null>(null);
  const [printedAt, setPrintedAt] = useState(() =>
    formatDateTime(new Date().toISOString(), locale),
  );
  const vehicles = bundle?.vehicles ?? [];
  const filterText =
    bundle && bundle.filters.length > 0
      ? bundle.filters.join(' · ')
      : t('print.filterNone');

  async function onPrint() {
    const next = await onCollect();
    flushSync(() => {
      setBundle(next);
      setPrintedAt(formatDateTime(new Date().toISOString(), locale));
    });
    await printSection('vehicles');
  }

  return (
    <>
      <PrintButton
        label={t('common.print')}
        disabled={disabled}
        onClick={() => void onPrint()}
      />
      <PrintRoot id="vehicles">
        <PrintHeader
          title={t('print.vehicleList')}
          meta={[
            { label: t('print.filters'), value: filterText },
            { label: t('print.printedAt'), value: printedAt },
            {
              label: t('print.printedBy'),
              value: user?.FullName?.trim() || t('common.emDash'),
            },
          ]}
        />
        <table className="print-table">
          <thead>
            <tr>
              <th>{t('issue.vin')}</th>
              <th>{t('issue.status')}</th>
              <th>{t('vehicles.station')}</th>
              <th>{t('vehicles.completionPct')}</th>
              <th>{t('print.openIssues')}</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.length === 0 ? (
              <tr>
                <td colSpan={5}>{t('vehicles.notFound')}</td>
              </tr>
            ) : (
              vehicles.map((v) => (
                <tr key={v.VIN}>
                  <td>{v.VIN}</td>
                  <td>
                    {vehicleListStatusLine(
                      v.CurrentGlobalStatus,
                      v.CurrentEOLStage,
                      t,
                    )}
                  </td>
                  <td>{bundle?.stationName(v.CurrentStationID) ?? t('common.emDash')}</td>
                  <td>{Number(v.TotalProgressPercentage).toFixed(1)}%</td>
                  <td>{bundle?.openIssueCount(v.VIN) ?? 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </PrintRoot>
    </>
  );
}
