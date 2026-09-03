import { Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { formatDateTime } from '../../../../shared/i18n';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n';
import {
  api,
  mediaFileUrl,
  type Issue,
  type IssueStatusHistoryEntry,
  type MediaAttachment,
} from '../../lib/api';
import { issueStationLabel, reporterFallback } from '../../lib/issueDetailCopy';
import { issueStatusLabel } from '../../lib/issueStatus';
import { printSection } from '../../lib/print';
import { PrintButton, PrintHeader, PrintRoot } from './PrintRoot';

function severityLabel(severity: string, t: { (key: 'severity.critical' | 'severity.medium' | 'severity.low'): string }): string {
  if (severity === 'CRITICAL') return t('severity.critical');
  if (severity === 'MEDIUM') return t('severity.medium');
  if (severity === 'LOW') return t('severity.low');
  return severity;
}

export function IssueListPrint({
  issues,
  filters,
}: {
  issues: Issue[];
  filters: string[];
}) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [printedAt, setPrintedAt] = useState(() =>
    formatDateTime(new Date().toISOString(), locale),
  );
  const filterText = filters.length > 0 ? filters.join(' · ') : t('print.filterNone');

  return (
    <>
      <PrintButton
        label={t('common.print')}
        icon={<Printer size={15} aria-hidden />}
        disabled={issues.length === 0}
        onClick={() => {
          flushSync(() => setPrintedAt(formatDateTime(new Date().toISOString(), locale)));
          void printSection('issues-list');
        }}
      />
      <PrintRoot id="issues-list">
        <PrintHeader
          title={t('print.issueList')}
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
              <th>{t('issue.id')}</th>
              <th>{t('issue.vin')}</th>
              <th>{t('issue.type')}</th>
              <th>{t('severity.label')}</th>
              <th>{t('issue.status')}</th>
              <th>{t('issueDetail.reporter')}</th>
              <th>{t('issueDetail.reportedAt')}</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => (
              <tr key={issue.ID}>
                <td>#{issue.ID}</td>
                <td>{issue.VIN}</td>
                <td>{issue.IssueTypeName || t('common.emDash')}</td>
                <td>{severityLabel(issue.Severity, t)}</td>
                <td>{issueStatusLabel(issue.Status, t)}</td>
                <td>{issue.ReporterName || reporterFallback(t, issue.IssueReporterID)}</td>
                <td>{formatDateTime(issue.CreatedAt || issue.IssueDate, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PrintRoot>
    </>
  );
}

export function IssueDetailPrint({ issue }: { issue: Issue }) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [history, setHistory] = useState<IssueStatusHistoryEntry[]>([]);
  const [report, setReport] = useState<MediaAttachment[]>([]);
  const [resolution, setResolution] = useState<MediaAttachment[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api.getIssueHistory(issue.ID).catch(() => ({ items: [] as IssueStatusHistoryEntry[] })),
      api.listMedia('ISSUE', String(issue.ID)).catch(() => ({ items: [] as MediaAttachment[] })),
      api
        .listMedia('ISSUE_RESOLUTION', String(issue.ID))
        .catch(() => ({ items: [] as MediaAttachment[] })),
    ]).then(([hist, reportRes, resolutionRes]) => {
      if (cancelled) return;
      setHistory(hist.items ?? []);
      setReport(reportRes.items ?? []);
      setResolution(resolutionRes.items ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [issue.ID]);

  const [printedAt, setPrintedAt] = useState(() =>
    formatDateTime(new Date().toISOString(), locale),
  );

  async function onPrint() {
    flushSync(() => setPrintedAt(formatDateTime(new Date().toISOString(), locale)));
    await printSection('issues-detail');
  }

  return (
    <>
      <PrintButton label={t('common.print')} icon={<Printer size={15} aria-hidden />} onClick={() => void onPrint()} />
      <PrintRoot id="issues-detail">
        <PrintHeader
          title={t('print.issueDetail')}
          meta={[
            { label: t('issue.id'), value: `#${issue.ID}` },
            { label: t('print.vin'), value: issue.VIN },
            { label: t('print.printedAt'), value: printedAt },
            {
              label: t('print.printedBy'),
              value: user?.FullName?.trim() || t('common.emDash'),
            },
          ]}
        />
        <section className="print-section">
          <p>
            <strong>{t('issueDetail.issueType')}:</strong>{' '}
            {issue.IssueTypeName || t('common.emDash')}
          </p>
          <p>
            <strong>{t('severity.label')}:</strong> {severityLabel(issue.Severity, t)}
          </p>
          <p>
            <strong>{t('issue.status')}:</strong> {issueStatusLabel(issue.Status, t)}
          </p>
          <p>
            <strong>{t('issueDetail.station')}:</strong> {issueStationLabel(issue)}
          </p>
          <p>
            <strong>{t('issueDetail.reporter')}:</strong>{' '}
            {issue.ReporterName || reporterFallback(t, issue.IssueReporterID)}
          </p>
          <p>
            <strong>{t('issueDetail.reportedAt')}:</strong>{' '}
            {formatDateTime(issue.CreatedAt || issue.IssueDate, locale)}
          </p>
          <p>
            <strong>{t('print.description')}:</strong> {issue.Description}
          </p>
          {issue.SolutionDescription?.trim() ? (
            <p>
              <strong>{t('issueDetail.solution')}:</strong> {issue.SolutionDescription.trim()}
            </p>
          ) : null}
        </section>
        <section className="print-section">
          <h2>{t('issueDetail.history')}</h2>
          {history.length === 0 ? (
            <p>{t('issueDetail.historyEmpty')}</p>
          ) : (
            <ol>
              {history.map((row) => (
                <li key={row.ID}>
                  {issueStatusLabel(row.FromStatus, t)} → {issueStatusLabel(row.ToStatus, t)}:{' '}
                  {row.ActorName || t('common.emDash')},{' '}
                  {formatDateTime(row.EventAt, locale)}
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="print-section">
          <h2>{t('issueDetail.photos')}</h2>
          <PhotoGroup heading={t('issueDetail.reportPhotos')} items={report} empty={t('print.noPhotos')} />
          <PhotoGroup
            heading={t('issueDetail.resolutionPhotos')}
            items={resolution}
            empty={t('print.noPhotos')}
          />
        </section>
      </PrintRoot>
    </>
  );
}

function PhotoGroup({
  heading,
  items,
  empty,
}: {
  heading: string;
  items: MediaAttachment[];
  empty: string;
}) {
  return (
    <div className="print-section">
      <h2>{heading}</h2>
      {items.length === 0 ? (
        <p>{empty}</p>
      ) : (
        <div className="print-photos">
          {items.map((item) => (
            <figure key={item.id} className="print-photo">
              {item.mime_type?.startsWith('image/') ? (
                <img src={mediaFileUrl(item.storage_path)} alt={item.file_name} />
              ) : null}
              <figcaption>{item.file_name}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
