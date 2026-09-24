import { Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { formatDateTime } from '../../../../shared/i18n';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n';
import {
  api,
  type Issue,
  type IssueStatusHistoryEntry,
  type MediaAttachment,
} from '../../lib/api';
import { issueStationLabel, defectLabels, reporterFallback } from '../../lib/issueDetailCopy';
import { issueStatusLabel } from '../../lib/issueStatus';
import { printSection } from '../../lib/print';
import {
  AuthenticatedMediaImg,
  preloadAuthenticatedMedia,
} from '../AuthenticatedMediaImg';
import { PrintButton, PrintHeader, PrintRoot } from './PrintRoot';

function severityLabel(severity: string, t: { (key: 'severity.critical' | 'severity.medium' | 'severity.low'): string }): string {
  if (severity === 'CRITICAL') return t('severity.critical');
  if (severity === 'MEDIUM') return t('severity.medium');
  if (severity === 'LOW') return t('severity.low');
  return severity;
}

export function IssueListPrint({
  matchTotal,
  filters,
  fetchIssues,
  disabled = false,
}: {
  matchTotal: number;
  filters: string[];
  fetchIssues: () => Promise<Issue[]>;
  disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const { user, token } = useAuth();
  const [includePhotos, setIncludePhotos] = useState(true);
  const [photosMounted, setPhotosMounted] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printProgress, setPrintProgress] = useState<string | null>(null);
  const [printIssues, setPrintIssues] = useState<Issue[]>([]);
  const [printedAt, setPrintedAt] = useState(() =>
    formatDateTime(new Date().toISOString(), locale),
  );
  const filterText = filters.length > 0 ? filters.join(' · ') : t('print.filterNone');

  async function onPrint() {
    setPrinting(true);
    setPrintProgress(t('print.preparing'));
    try {
      const withPhotos = includePhotos;
      const rows = await fetchIssues();
      flushSync(() => {
        setPrintIssues(rows);
        setPrintedAt(formatDateTime(new Date().toISOString(), locale));
        setPhotosMounted(withPhotos);
      });
      if (withPhotos && token) {
        const paths = rows
          .map((i) => i.ReportPhotoPath)
          .filter((p): p is string => Boolean(p));
        await preloadAuthenticatedMedia(
          token,
          paths.map((storagePath) => ({ storagePath, variant: 'sm' as const })),
        );
        flushSync(() => setPhotosMounted(true));
        await new Promise<void>((r) => {
          requestAnimationFrame(() => requestAnimationFrame(() => r()));
        });
      }
      await printSection('issues-list');
    } finally {
      setPhotosMounted(false);
      setPrinting(false);
      setPrintProgress(null);
    }
  }

  return (
    <>
      <div className="inline-flex flex-wrap items-center gap-2">
        <label className="inline-flex min-h-touch cursor-pointer items-center gap-2 text-[13px] text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={includePhotos}
            onChange={(e) => setIncludePhotos(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          {t('print.withPhotos')}
        </label>
        <PrintButton
          label={
            printing
              ? t('print.preparing')
              : `${t('common.print')} (${matchTotal})`
          }
          icon={<Printer size={15} aria-hidden />}
          disabled={disabled || matchTotal === 0 || printing}
          onClick={() => void onPrint()}
        />
        {printProgress ? (
          <span className="text-[12px] text-[var(--text-secondary)]" aria-live="polite">
            {printProgress}
          </span>
        ) : null}
      </div>
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
              {includePhotos ? <th className="print-col-photo">{t('print.photo')}</th> : null}
              <th>{t('issue.id')}</th>
              <th>{t('issue.vin')}</th>
              <th>{t('issue.type')}</th>
              <th>{t('issue.defectPart')}</th>
              <th>{t('severity.label')}</th>
              <th>{t('issue.status')}</th>
              <th>{t('issueDetail.reporter')}</th>
              <th>{t('issueDetail.reportedAt')}</th>
            </tr>
          </thead>
          <tbody>
            {printIssues.map((issue) => (
              <tr key={issue.ID}>
                {includePhotos ? (
                  <td className="print-col-photo">
                    <div className="print-list-thumb">
                      {photosMounted && issue.ReportPhotoPath ? (
                        <AuthenticatedMediaImg
                          storagePath={issue.ReportPhotoPath}
                          variant="sm"
                          lazy={false}
                          alt=""
                        />
                      ) : (
                        <span className="print-list-thumb-empty" aria-hidden />
                      )}
                    </div>
                  </td>
                ) : null}
                <td>#{issue.ID}</td>
                <td>{issue.VIN}</td>
                <td>{issue.IssueTypeName || t('common.emDash')}</td>
                <td>{defectLabels(issue, t, locale).listLine}</td>
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
          {(() => {
            const d = defectLabels(issue, t, locale);
            return (
              <>
                <p>
                  <strong>{t('issue.defectZone')}:</strong> {d.zone}
                </p>
                <p>
                  <strong>{t('issue.defectPart')}:</strong> {d.part}
                </p>
                <p>
                  <strong>{t('issue.defectType')}:</strong> {d.type}
                </p>
                <p>
                  <strong>{t('issue.defectProcess')}:</strong> {d.process}
                </p>
                <p>
                  <strong>{t('issue.defectCode')}:</strong> {d.code}
                </p>
              </>
            );
          })()}
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
                <AuthenticatedMediaImg
                  storagePath={item.storage_path}
                  alt={item.file_name}
                />
              ) : null}
              <figcaption>{item.file_name}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
