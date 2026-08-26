import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, mediaFileUrl, type Issue, type IssueType, type MediaAttachment } from '../lib/api';
import { IssueList } from '../components/IssueList';
import { issueMatchesListQuery } from '../lib/issueVinFilter';
import { issueTypeChipLabel } from '../lib/issueTypeLabel';
import {
  HOME_ISSUE_STAT_LABELS,
  isHomeIssueStatKey,
  matchesHomeIssueStat,
} from '../lib/homeIssueStats';
import {
  ANALYSIS_ISSUE_STAT_LABELS,
  isAnalysisIssueStatKey,
  matchesAnalysisIssueStat,
} from '../lib/analysisIssueStats';
import { useTheme } from '../theme/ThemeProvider';
import {
  brandColors,
  chipSelectedInk,
  inkOn,
  readableOn,
  selectedChipFill,
  tokensFor,
} from '../theme/tokens';
import {
  SeverityIndicator,
  severityFillColor,
  type SeverityLevel,
} from '../components/SeverityIndicator';
import { issueStatusColor } from '../lib/issueStatus';
import {
  buildIssuesCsv,
  buildIssuesZip,
  downloadBlob,
  type IssueExportPhoto,
} from '../lib/issueExport';

type IssueStatus = Issue['Status'];

const SEVERITIES: SeverityLevel[] = ['CRITICAL', 'MEDIUM', 'LOW'];

const STATUSES: { value: IssueStatus; label: string }[] = [
  { value: 'OPEN', label: 'Açık' },
  { value: 'IN_PROGRESS', label: 'İşlemde' },
  { value: 'DONE', label: 'Tamamlandı' },
  { value: 'CONDITIONAL_APPROVED', label: 'Şartlı Onay' },
  { value: 'APPROVED', label: 'Kalite Onay' },
];

/** Issues list + detail — quality sign-off is gated on issue.transition.* permissions. */
export default function IssuesPage() {
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
      setError(err instanceof Error ? err.message : 'Issue listesi yüklenemedi');
      setItems([]);
    }
  }, []);

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
      const csv = buildIssuesCsv(visible, urls);
      downloadBlob(
        new Blob([csv], { type: 'text/csv;charset=utf-8' }),
        `issues-${exportStamp()}.csv`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV dışa aktarma başarısız');
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
      const csv = buildIssuesCsv(visible, urls);
      const zip = buildIssuesZip(csv, photos);
      downloadBlob(
        new Blob([zip as BlobPart], { type: 'application/zip' }),
        `issues-${exportStamp()}.zip`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ZIP dışa aktarma başarısız');
    } finally {
      setExporting(null);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold sm:text-2xl">Issues</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={exporting !== null || visible.length === 0}
            onClick={() => void exportCsv()}
            className="min-h-touch rounded-lg border px-3 py-1.5 text-[13px] hover:bg-[var(--bg-surface-2)] disabled:opacity-40"
            style={{ borderColor: 'var(--border)' }}
          >
            {exporting === 'csv' ? 'CSV…' : `CSV (${visible.length})`}
          </button>
          <button
            type="button"
            disabled={exporting !== null || visible.length === 0}
            onClick={() => void exportZip()}
            className="min-h-touch rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[13px] text-white hover:brightness-110 disabled:opacity-40"
          >
            {exporting === 'zip' ? 'ZIP…' : `ZIP (${visible.length})`}
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
              ? `Home filtre: ${HOME_ISSUE_STAT_LABELS[homeStat]} · ${visible.length} kayıt`
              : `Analiz filtre: ${ANALYSIS_ISSUE_STAT_LABELS[analysisStat!]}${
                  analysisFrom || analysisTo
                    ? ` · ${analysisFrom || '…'} → ${analysisTo || '…'}`
                    : ''
                } · ${visible.length} kayıt`}
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
            Temizle
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
              VIN / bildiren
            </label>
            <input
              type="search"
              value={listQuery}
              onChange={(e) => {
                if (homeStat || analysisStat) clearHomeStat();
                setListQuery(e.target.value);
              }}
              placeholder="VIN veya bildiren adı"
              aria-label="VIN veya bildiren adı"
              className="mt-1 w-full rounded-lg border bg-[var(--bg-page)] px-3 py-2 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
              style={{ borderColor: 'var(--border)' }}
            />
          </div>
          <div className="max-w-full">
            <p
              className="mb-2 text-[13px] font-semibold"
              style={{ color: 'var(--text-secondary)' }}
            >
              Tür
            </p>
            <div className="flex flex-wrap gap-2">
              {issueTypes.map((t) => {
                const selected = !homeStat && !analysisStat && typeIds.has(t.ID);
                return (
                  <button
                    key={t.ID}
                    type="button"
                    onClick={() => toggleType(t.ID)}
                    className={CHIP_CLASS}
                    style={chipStyle(selected, brandColors.primary, pageBg)}
                  >
                    {issueTypeChipLabel(t.Name)}
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
              Durum
            </p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => {
                const selected = !homeStat && !analysisStat && statuses.has(s.value);
                const color = issueStatusColor(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleStatus(s.value)}
                    className={`${CHIP_CLASS} shrink-0`}
                    style={chipStyle(selected, color, pageBg)}
                  >
                    {s.label}
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
              Severity
            </p>
            <div className="flex flex-wrap gap-2">
              {SEVERITIES.map((s) => {
                const selected = !homeStat && !analysisStat && severities.has(s);
                const color = severityFillColor(s);
                const ink = selected
                  ? chipSelectedInk
                  : readableOn(color, pageBg);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSeverity(s)}
                    className={CHIP_CLASS}
                    style={severityChipStyle(selected, color, pageBg)}
                  >
                    <SeverityIndicator severity={s} ink={ink} />
                    <span>{s}</span>
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
  'inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold outline-none focus-visible:[box-shadow:0_0_0_2px_var(--chip-focus)]';

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
    outline: 'none',
    ['--chip-focus' as string]: color,
  };
}

function severityChipStyle(
  selected: boolean,
  color: string,
  pageBg: string,
): CSSProperties {
  if (!selected) {
    return {
      borderColor: color,
      backgroundColor: pageBg,
      color: readableOn(color, pageBg),
      outline: 'none',
      ['--chip-focus' as string]: color,
    };
  }
  const fill = selectedChipFill(color);
  return {
    borderColor: 'transparent',
    backgroundColor: fill,
    color: chipSelectedInk,
    outline: 'none',
    ['--chip-focus' as string]: fill,
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
