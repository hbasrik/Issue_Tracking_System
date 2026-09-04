import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Archive, FileSpreadsheet } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api, mediaFileUrl, type Issue, type IssueType, type MediaAttachment } from '../lib/api';
import { IssueList } from '../components/IssueList';
import { issueMatchesListQuery } from '../lib/issueVinFilter';
import { issueTypeChipLabel } from '../lib/issueTypeLabel';
import {
  homeIssueStatLabel,
  isHomeIssueStatKey,
  matchesHomeIssueStat,
} from '../lib/homeIssueStats';
import {
  analysisIssueStatLabel,
  isAnalysisIssueStatKey,
  matchesAnalysisIssueStat,
} from '../lib/analysisIssueStats';
import { useTheme } from '../theme/ThemeProvider';
import {
  brandColors,
  inkOn,
  readableOn,
  tokensFor,
} from '../theme/tokens';
import {
  SeverityIndicator,
  severityFillColor,
  type SeverityLevel,
} from '../components/SeverityIndicator';
import { issueStatusColor, issueStatusLabel } from '../lib/issueStatus';
import {
  buildIssuesCsv,
  buildIssuesZip,
  downloadBlob,
  type IssueExportPhoto,
} from '../lib/issueExport';
import { useI18n, type Translate } from '../i18n';
import { IssueListPrint } from '../components/print/IssuePrint';

type IssueStatus = Issue['Status'];

const SEVERITIES: SeverityLevel[] = ['CRITICAL', 'MEDIUM', 'LOW'];

const STATUSES: IssueStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'DONE',
  'CONDITIONAL_APPROVED',
  'APPROVED',
];

function severityLabel(s: SeverityLevel, t: Translate): string {
  switch (s) {
    case 'CRITICAL':
      return t('severity.critical');
    case 'MEDIUM':
      return t('severity.medium');
    case 'LOW':
      return t('severity.low');
  }
}

/** Issues list + detail — quality sign-off is gated on issue.transition.* permissions. */
export default function IssuesPage() {
  const { t } = useI18n();
  const { mode } = useTheme();
  const pageBg = tokensFor(mode)['bg-page'];
  const [searchParams, setSearchParams] = useSearchParams();
  const homeStatParam = searchParams.get('homeStat');
  const homeStat = isHomeIssueStatKey(homeStatParam) ? homeStatParam : null;
  const analysisStatParam = searchParams.get('analysisStat');
  const analysisStat = isAnalysisIssueStatKey(analysisStatParam)
    ? analysisStatParam
    : null;
  const analysisFrom = searchParams.get('from') ?? undefined;
  const analysisTo = searchParams.get('to') ?? undefined;

  const [listQuery, setListQuery] = useState('');
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([]);
  const [typeIds, setTypeIds] = useState<Set<number>>(new Set());
  const [severities, setSeverities] = useState<Set<SeverityLevel>>(new Set());
  const [statuses, setStatuses] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [homeStatNow] = useState(() => new Date());
  const [exporting, setExporting] = useState<'csv' | 'zip' | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [res, typesRes] = await Promise.all([
        api.listIssues(),
        api.listIssueTypes().catch(() => ({ items: [] as IssueType[] })),
      ]);
      const list = (res.items ?? []).slice().sort((a, b) => {
        const ta = Date.parse(a.CreatedAt || a.IssueDate || '') || 0;
        const tb = Date.parse(b.CreatedAt || b.IssueDate || '') || 0;
        if (tb !== ta) return tb - ta;
        return b.ID - a.ID;
      });
      setItems(list);
      setIssueTypes(typesRes.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('issue.listFailed'));
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  function clearHomeStat() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('homeStat');
        next.delete('analysisStat');
        next.delete('from');
        next.delete('to');
        return next;
      },
      { replace: true },
    );
  }

  function toggleType(id: number) {
    if (homeStat || analysisStat) clearHomeStat();
    setTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSeverity(s: SeverityLevel) {
    if (homeStat || analysisStat) clearHomeStat();
    setSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function toggleStatus(s: string) {
    if (homeStat || analysisStat) clearHomeStat();
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const visible = useMemo(
    () =>
      items.filter((issue) => {
        if (homeStat) {
          return matchesHomeIssueStat(issue, homeStat, homeStatNow);
        }
        if (analysisStat) {
          return matchesAnalysisIssueStat(
            issue,
            analysisStat,
            analysisFrom,
            analysisTo,
          );
        }
        if (!issueMatchesListQuery(issue, listQuery)) {
          return false;
        }
        if (typeIds.size > 0) {
          if (issue.IssueTypeID == null || !typeIds.has(issue.IssueTypeID)) {
            return false;
          }
        }
        if (severities.size > 0 && !severities.has(issue.Severity as SeverityLevel)) {
          return false;
        }
        if (statuses.size > 0 && !statuses.has(issue.Status)) {
          return false;
        }
        return true;
      }),
    [items, listQuery, homeStat, homeStatNow, analysisStat, analysisFrom, analysisTo, typeIds, severities, statuses],
  );

  async function attachmentsFor(issues: Issue[]) {
    const byId = new Map<
      number,
      { report: MediaAttachment[]; resolution: MediaAttachment[] }
    >();
    await Promise.all(
      issues.map(async (issue) => {
        const [report, resolution] = await Promise.all([
          api.listMedia('ISSUE', String(issue.ID)),
          api.listMedia('ISSUE_RESOLUTION', String(issue.ID)),
        ]);
        byId.set(issue.ID, {
          report: report.items ?? [],
          resolution: resolution.items ?? [],
        });
      }),
    );
    return byId;
  }

  function photoUrls(
    pack: { report: MediaAttachment[]; resolution: MediaAttachment[] },
  ): string[] {
    return [...pack.report, ...pack.resolution].map((item) =>
      mediaFileUrl(item.storage_path),
    );
  }

  async function exportCsv() {
    setExporting('csv');
    setError(null);
    try {
      const attachments = await attachmentsFor(visible);
      const urls = new Map<number, string[]>();
      for (const issue of visible) {
        urls.set(issue.ID, photoUrls(attachments.get(issue.ID) ?? { report: [], resolution: [] }));
      }
      const csv = buildIssuesCsv(visible, urls, t);
      downloadBlob(
        new Blob([csv], { type: 'text/csv;charset=utf-8' }),
        `issues-${exportStamp()}.csv`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('issue.exportCsvFailed'));
    } finally {
      setExporting(null);
    }
  }

  async function exportZip() {
    setExporting('zip');
    setError(null);
    try {
      const attachments = await attachmentsFor(visible);
      const urls = new Map<number, string[]>();
      const photos: IssueExportPhoto[] = [];
      for (const issue of visible) {
        const pack = attachments.get(issue.ID) ?? { report: [], resolution: [] };
        urls.set(issue.ID, photoUrls(pack));
        photos.push(
          ...(await fetchExportPhotos(issue.ID, 'rapor', pack.report)),
          ...(await fetchExportPhotos(issue.ID, 'cozum', pack.resolution)),
        );
      }
      const csv = buildIssuesCsv(visible, urls, t);
      const zip = buildIssuesZip(csv, photos);
      downloadBlob(
        new Blob([zip as BlobPart], { type: 'application/zip' }),
        `issues-${exportStamp()}.zip`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('issue.exportZipFailed'));
    } finally {
      setExporting(null);
    }
  }

  const analysisBanner = analysisStat
    ? analysisFrom || analysisTo
      ? t('issue.analysisFilterRange', {
          label: analysisIssueStatLabel(analysisStat, t),
          range: t('analysis.to', {
            from: analysisFrom || '…',
            to: analysisTo || '…',
          }),
          n: visible.length,
        })
      : t('issue.analysisFilter', {
          label: analysisIssueStatLabel(analysisStat, t),
          n: visible.length,
        })
    : null;

  const printFilters: string[] = [];
  if (homeStat) {
    printFilters.push(t('print.filterHome', { label: homeIssueStatLabel(homeStat, t) }));
  }
  if (analysisStat) {
    printFilters.push(
      t('print.filterAnalysis', { label: analysisIssueStatLabel(analysisStat, t) }),
    );
    if (analysisFrom || analysisTo) {
      printFilters.push(
        t('print.filterRange', {
          from: analysisFrom || '…',
          to: analysisTo || '…',
        }),
      );
    }
  }
  if (!homeStat && !analysisStat) {
    if (listQuery.trim()) {
      printFilters.push(t('print.filterSearch', { q: listQuery.trim() }));
    }
    if (typeIds.size > 0) {
      const names = issueTypes
        .filter((it) => typeIds.has(it.ID))
        .map((it) => issueTypeChipLabel(it.Name));
      if (names.length) printFilters.push(t('print.filterTypes', { list: names.join(', ') }));
    }
    if (severities.size > 0) {
      printFilters.push(
        t('print.filterSeverities', {
          list: [...severities].map((s) => severityLabel(s, t)).join(', '),
        }),
      );
    }
    if (statuses.size > 0) {
      printFilters.push(
        t('print.filterStatuses', {
          list: [...statuses].map((s) => issueStatusLabel(s, t)).join(', '),
        }),
      );
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold sm:text-2xl">{t('nav.issues')}</h1>
        <div className="flex flex-wrap gap-2">
          <IssueListPrint issues={visible} filters={printFilters} />
          <button
            type="button"
            disabled={exporting !== null || visible.length === 0}
            onClick={() => void exportCsv()}
            className="inline-flex min-h-touch items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium hover:bg-[var(--bg-surface-2)] disabled:opacity-40"
            style={{ borderColor: 'var(--border)' }}
          >
            <FileSpreadsheet size={15} aria-hidden />
            {exporting === 'csv'
              ? t('issue.exportingCsv')
              : t('issue.csvN', { n: visible.length })}
          </button>
          <button
            type="button"
            disabled={exporting !== null || visible.length === 0}
            onClick={() => void exportZip()}
            className="inline-flex min-h-touch items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-40"
          >
            <Archive size={15} aria-hidden />
            {exporting === 'zip'
              ? t('issue.exportingZip')
              : t('issue.zipN', { n: visible.length })}
          </button>
        </div>
      </div>

      {(homeStat || analysisStat) && (
        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-[var(--bg-surface-1)] px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-[13px] text-[var(--text-primary)]">
            {homeStat
              ? t('issue.homeFilter', {
                  label: homeIssueStatLabel(homeStat, t),
                  n: visible.length,
                })
              : analysisBanner}
          </p>
          <button
            type="button"
            onClick={clearHomeStat}
            className="min-h-touch rounded-lg border px-3 py-1.5 text-[13px] hover:bg-[var(--bg-surface-2)]"
            style={{
              borderColor: 'var(--border)',
              color: brandColors.secondary,
            }}
          >
            {t('common.clear')}
          </button>
        </div>
      )}

      <div
        className="mt-4 space-y-4 rounded-xl border bg-[var(--bg-surface-1)] p-4"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="grid grid-cols-1 items-start justify-start gap-x-6 gap-y-4 sm:grid-cols-[max-content_max-content]">
          <div className="w-full max-w-sm">
            <label
              className="text-[13px] font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              {t('issue.searchLabel')}
            </label>
            <input
              type="search"
              value={listQuery}
              onChange={(e) => {
                if (homeStat || analysisStat) clearHomeStat();
                setListQuery(e.target.value);
              }}
              placeholder={t('issue.searchPlaceholder')}
              aria-label={t('issue.searchPlaceholder')}
              className="mt-1 w-full rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
              style={{ borderColor: 'var(--border)' }}
            />
          </div>
          <div className="max-w-full">
            <p
              className="mb-2 text-[13px] font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              {t('issue.type')}
            </p>
            <div className="flex flex-wrap gap-2">
              {issueTypes.map((itype) => {
                const selected = !homeStat && !analysisStat && typeIds.has(itype.ID);
                return (
                  <button
                    key={itype.ID}
                    type="button"
                    onClick={() => toggleType(itype.ID)}
                    className={TYPE_CHIP_CLASS}
                    style={typeChipStyle(selected)}
                  >
                    {issueTypeChipLabel(itype.Name)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="max-w-full">
            <p
              className="mb-2 text-[13px] font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              {t('issue.status')}
            </p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((status) => {
                const selected = !homeStat && !analysisStat && statuses.has(status);
                const color = issueStatusColor(status);
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => toggleStatus(status)}
                    className={`${CHIP_CLASS} shrink-0`}
                    style={chipStyle(selected, color, pageBg)}
                  >
                    {issueStatusLabel(status, t)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="max-w-full">
            <p
              className="mb-2 text-[13px] font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              {t('severity.label')}
            </p>
            <div className="flex flex-wrap gap-2">
              {SEVERITIES.map((s) => {
                const selected = !homeStat && !analysisStat && severities.has(s);
                const color = severityFillColor(s);
                const name = severityLabel(s, t);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSeverity(s)}
                    className={SEVERITY_CHIP_CLASS}
                    style={severityChipStyle(selected, color)}
                    aria-label={name}
                    aria-pressed={selected}
                    title={name}
                  >
                    <SeverityIndicator severity={s} decorative />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      <div className="mt-4">
        <IssueList items={visible} onStatusChanged={() => void load()} />
      </div>
    </section>
  );
}

const CHIP_CLASS =
  'inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold';

const TYPE_CHIP_CLASS =
  'inline-flex min-h-[36px] items-center rounded-full px-3 text-[12px] font-semibold';

const SEVERITY_CHIP_CLASS =
  'inline-flex min-h-touch min-w-touch items-center justify-center rounded-full px-2.5';

function chipStyle(
  selected: boolean,
  color: string,
  pageBg: string,
): CSSProperties {
  const fill = selected ? color : pageBg;
  const ink = selected ? inkOn(color) : readableOn(color, pageBg);
  return {
    borderColor: color,
    backgroundColor: fill,
    color: ink,
  };
}

function typeChipStyle(selected: boolean): CSSProperties {
  return {
    border: 'none',
    backgroundColor: selected
      ? 'color-mix(in srgb, var(--text-primary) 18%, var(--bg-surface-1))'
      : 'color-mix(in srgb, var(--text-primary) 8%, var(--bg-surface-1))',
    color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
  };
}

function severityChipStyle(selected: boolean, color: string): CSSProperties {
  return {
    border: 'none',
    backgroundColor: selected
      ? `color-mix(in srgb, ${color} 22%, var(--bg-surface-1))`
      : 'transparent',
  };
}

function exportStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

async function fetchExportPhotos(
  issueId: number,
  kind: 'rapor' | 'cozum',
  items: MediaAttachment[],
): Promise<IssueExportPhoto[]> {
  const out: IssueExportPhoto[] = [];
  let index = 0;
  for (const item of items) {
    index += 1;
    const url = mediaFileUrl(item.storage_path);
    const res = await fetch(url);
    if (!res.ok) continue;
    out.push({
      issueId,
      kind,
      index,
      fileName: item.file_name,
      bytes: new Uint8Array(await res.arrayBuffer()),
      url,
    });
  }
  return out;
}
