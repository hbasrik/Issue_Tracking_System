import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Archive, ChevronDown, FileSpreadsheet, Volume2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ISSUE_CARD_COMPACT_MAX_PX } from '../../../shared/issueCardLayout';
import { useAuth } from '../auth/AuthProvider';
import {
  api,
  ApiError,
  mediaFileUrl,
  type DefectPart,
  type DefectType,
  type DefectZone,
  type Issue,
  type IssueType,
  type MediaAttachment,
} from '../lib/api';
import { IssueList } from '../components/IssueList';
import { PartMultiSelect } from '../components/PartMultiSelect';
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
import { isAuthError } from '../../../shared/networkError';
import { issueReportedAtIso } from '../../../shared/issueCardLayout';
import { detectNewCriticalIds } from '../../../shared/newCriticalIds';
import { localeTag } from '../../../shared/i18n';
import { IssueListPrint } from '../components/print/IssuePrint';
import {
  playCriticalAlert,
  unlockCriticalAudio,
} from '../lib/criticalAlertSound';
import {
  readAppScrollTop,
  readIssuesBoardUI,
  restoreAppScrollTop,
  writeIssuesBoardUI,
} from '../lib/issuesBoardState';

type IssueStatus = Issue['Status'];

const SEVERITIES: SeverityLevel[] = ['CRITICAL', 'MEDIUM', 'LOW'];

const STATUSES: IssueStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'DONE',
  'CONDITIONAL_APPROVED',
  'APPROVED',
];

const ADVANCED_FILTERS_OPEN_KEY = 'karea-issues-advanced-filters-open';
const AUTO_REFRESH_MS = 30_000;
const HIGHLIGHT_MS = 6_000;
const PAGE_SIZE = 50;
/** Empty = no status filter (all statuses). Old OPEN+IN_PROGRESS default removed. */
const DEFAULT_BOARD_STATUSES: readonly string[] = [];
const SCROLL_LOAD_THRESHOLD_PX = 480;
/** ZIP hard cap — browser memory; CSV/print stay unlimited with progress. */
const ZIP_HARD_MAX_ISSUES = 500;
const ZIP_CONFIRM_MIN = 80;
/** Rough MB per issue with photos (for pre-ZIP estimate). */
const ZIP_MB_PER_ISSUE_EST = 0.35;

function sortIssuesNewestFirst(list: Issue[]): Issue[] {
  return list.slice().sort((a, b) => {
    const ta = Date.parse(issueReportedAtIso(a) || '') || 0;
    const tb = Date.parse(issueReportedAtIso(b) || '') || 0;
    if (tb !== ta) return tb - ta;
    return b.ID - a.ID;
  });
}

/** Silent 30s refresh: replace first page, keep later pages, dedupe by id. */
function mergeFirstPage(existing: Issue[], firstPage: Issue[]): Issue[] {
  const firstIds = new Set(firstPage.map((i) => i.ID));
  // Keep anything not in the fresh first page (do not assume len === PAGE_SIZE).
  const later = existing.filter((i) => !firstIds.has(i.ID));
  return sortIssuesNewestFirst([...firstPage, ...later]);
}

function statusQueryParam(statuses: Set<string>): string | undefined {
  if (statuses.size === 0) return undefined;
  return [...statuses].join(',');
}

function resolveInitialStatuses(
  saved: ReturnType<typeof readIssuesBoardUI>,
): Set<string> {
  if (!saved) return new Set(DEFAULT_BOARD_STATUSES);
  if (Object.prototype.hasOwnProperty.call(saved, 'statuses')) {
    return new Set(saved.statuses ?? []);
  }
  return new Set(DEFAULT_BOARD_STATUSES);
}

function readAdvancedFiltersOpen(): boolean {
  try {
    return localStorage.getItem(ADVANCED_FILTERS_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

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

function initialBoardFilters() {
  const saved = readIssuesBoardUI();
  if (!saved) {
    return {
      listQuery: '',
      typeIds: new Set<number>(),
      defectZoneIds: new Set<number>(),
      defectPartIds: new Set<number>(),
      defectTypeIds: new Set<number>(),
      severities: new Set<SeverityLevel>(),
      statuses: new Set<string>(DEFAULT_BOARD_STATUSES),
      advancedOpen: readAdvancedFiltersOpen(),
      scrollTop: 0,
    };
  }
  return {
    listQuery: saved.listQuery ?? '',
    typeIds: new Set(saved.typeIds ?? []),
    defectZoneIds: new Set(saved.defectZoneIds ?? []),
    defectPartIds: new Set(saved.defectPartIds ?? []),
    defectTypeIds: new Set(saved.defectTypeIds ?? []),
    severities: new Set(saved.severities ?? []),
    statuses: resolveInitialStatuses(saved),
    advancedOpen:
      typeof saved.advancedOpen === 'boolean'
        ? saved.advancedOpen
        : readAdvancedFiltersOpen(),
    scrollTop: saved.scrollTop ?? 0,
  };
}

/** Issues list + detail — quality sign-off is gated on issue.transition.* permissions. */
export default function IssuesPage() {
  const { t, locale } = useI18n();
  const { token } = useAuth();
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

  const boot = useMemo(() => initialBoardFilters(), []);
  const [listQuery, setListQuery] = useState(boot.listQuery);
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([]);
  const [defectZones, setDefectZones] = useState<DefectZone[]>([]);
  const [defectParts, setDefectParts] = useState<DefectPart[]>([]);
  const [defectTypes, setDefectTypes] = useState<DefectType[]>([]);
  const [typeIds, setTypeIds] = useState<Set<number>>(boot.typeIds);
  const [defectZoneIds, setDefectZoneIds] = useState<Set<number>>(boot.defectZoneIds);
  const [defectPartIds, setDefectPartIds] = useState<Set<number>>(boot.defectPartIds);
  const [defectTypeIds, setDefectTypeIds] = useState<Set<number>>(boot.defectTypeIds);
  const [severities, setSeverities] = useState<Set<SeverityLevel>>(boot.severities);
  const [statuses, setStatuses] = useState<Set<string>>(boot.statuses);
  const [items, setItems] = useState<Issue[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleWarning, setStaleWarning] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [soundUnlockNeeded, setSoundUnlockNeeded] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState<Set<number>>(new Set());
  const [homeStatNow] = useState(() => new Date());
  const [exporting, setExporting] = useState<'csv' | 'zip' | null>(null);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  /** Full filter match count (server full list ∩ client filters), not loaded pages. */
  const [matchTotal, setMatchTotal] = useState<number | null>(null);
  const [matchCounting, setMatchCounting] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(boot.advancedOpen);
  /** Narrow layout: status/severity/advanced collapsed by default. */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewportW, setViewportW] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024,
  );
  const compactFilters = viewportW < ISSUE_CARD_COMPACT_MAX_PX;
  const knownIdsRef = useRef<Set<number> | null>(null);
  const highlightTimersRef = useRef<number[]>([]);
  const pendingScrollRef = useRef(boot.scrollTop);
  const itemsRef = useRef<Issue[]>([]);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const catalogsLoadedRef = useRef(false);
  const fetchGenRef = useRef(0);
  const cursorRef = useRef<{
    beforeDate?: string;
    beforeId?: number;
    nextOffset?: number;
  } | null>(null);

  itemsRef.current = items;
  hasMoreRef.current = hasMore;

  const drillDown = Boolean(homeStat || analysisStat);

  useEffect(() => {
    function onResize() {
      setViewportW(window.innerWidth);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const persistBoardUI = useCallback(() => {
    const liveTop = readAppScrollTop();
    const prev = readIssuesBoardUI();
    writeIssuesBoardUI({
      listQuery,
      typeIds: [...typeIds],
      defectZoneIds: [...defectZoneIds],
      defectPartIds: [...defectPartIds],
      defectTypeIds: [...defectTypeIds],
      severities: [...severities],
      statuses: [...statuses],
      advancedOpen,
      // Unmount often sees scrollTop=0 after the route already swapped — keep
      // any non-zero value flushed by IssueCard / the scroll listener.
      scrollTop: liveTop > 0 ? liveTop : (prev?.scrollTop ?? 0),
    });
  }, [
    listQuery,
    typeIds,
    defectZoneIds,
    defectPartIds,
    defectTypeIds,
    severities,
    statuses,
    advancedOpen,
  ]);

  useEffect(() => {
    return () => {
      persistBoardUI();
      for (const id of highlightTimersRef.current) window.clearTimeout(id);
    };
  }, [persistBoardUI]);

  const flashCritical = useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    setHighlightedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    const timer = window.setTimeout(() => {
      setHighlightedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }, HIGHLIGHT_MS);
    highlightTimersRef.current.push(timer);
  }, []);

  const applyPageMeta = useCallback(
    (res: {
      has_more?: boolean;
      next_offset?: number;
      next_before_date?: string;
      next_before_id?: number;
    }) => {
      const more = res.has_more === true;
      setHasMore(more);
      hasMoreRef.current = more;
      if (more) {
        cursorRef.current = {
          beforeDate: res.next_before_date,
          beforeId: res.next_before_id,
          nextOffset: res.next_offset,
        };
      } else {
        cursorRef.current = null;
      }
    },
    [],
  );

  const loadCatalogs = useCallback(async () => {
    const [typesRes, zonesRes, partsRes, defectTypesRes] = await Promise.all([
      api.listIssueTypes().catch(() => ({ items: [] as IssueType[] })),
      api.listDefectCatalogZones().catch(() => ({ items: [] as DefectZone[] })),
      api.listDefectCatalogParts().catch(() => ({ items: [] as DefectPart[] })),
      api.listDefectCatalogTypes().catch(() => ({ items: [] as DefectType[] })),
    ]);
    setIssueTypes(typesRes.items ?? []);
    setDefectZones(zonesRes.items ?? []);
    setDefectParts(partsRes.items ?? []);
    setDefectTypes(defectTypesRes.items ?? []);
    catalogsLoadedRef.current = true;
  }, []);

  const boardStatusParam = useCallback(() => {
    if (homeStat || analysisStat) return undefined;
    return statusQueryParam(statuses);
  }, [homeStat, analysisStat, statuses]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) setError(null);
      const status = boardStatusParam();
      const isDrill = Boolean(homeStat || analysisStat);
      const gen = silent ? fetchGenRef.current : ++fetchGenRef.current;
      try {
        const issuesPromise = isDrill
          ? api.listIssues({ status, unlimited: true })
          : api.listIssues({
              status,
              limit: PAGE_SIZE,
              offset: 0,
            });
        const catalogPromise =
          !catalogsLoadedRef.current || !silent
            ? loadCatalogs()
            : Promise.resolve();
        const [res] = await Promise.all([issuesPromise, catalogPromise]);
        if (gen !== fetchGenRef.current) return;
        const page = sortIssuesNewestFirst(res.items ?? []);

        let nextList: Issue[];
        if (silent && !isDrill) {
          nextList = mergeFirstPage(itemsRef.current, page);
        } else {
          nextList = page;
          if (!isDrill) {
            applyPageMeta(res);
          } else {
            setHasMore(false);
            hasMoreRef.current = false;
            cursorRef.current = null;
          }
        }

        const { knownIds, newCriticalIds } = detectNewCriticalIds(
          knownIdsRef.current,
          nextList,
        );
        knownIdsRef.current = knownIds;
        setItems(nextList);
        itemsRef.current = nextList;
        setUpdatedAt(new Date());
        setStaleWarning(null);
        if (newCriticalIds.length > 0) {
          flashCritical(newCriticalIds);
          const play = await playCriticalAlert();
          if (!play.ok && play.blocked) setSoundUnlockNeeded(true);
        }
      } catch (err) {
        if (gen !== fetchGenRef.current) return;
        // 401 clears the session and navigates to login — do not paint an empty list.
        if (isAuthError(err) || (err instanceof ApiError && err.status === 401)) {
          return;
        }
        const msg = err instanceof Error ? err.message : t('issue.listFailed');
        if (silent) {
          setStaleWarning(msg || t('issue.refreshStale'));
        } else {
          setError(msg);
        }
      }
    },
    [
      t,
      flashCritical,
      boardStatusParam,
      homeStat,
      analysisStat,
      loadCatalogs,
      applyPageMeta,
    ],
  );

  const loadMore = useCallback(async () => {
    if (homeStat || analysisStat) return;
    if (!hasMoreRef.current || loadingMoreRef.current) return;
    const cursor = cursorRef.current;
    if (!cursor) return;

    const gen = fetchGenRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const status = boardStatusParam();
      const useKeyset =
        cursor.beforeDate != null && cursor.beforeId != null;
      const res = await api.listIssues(
        useKeyset
          ? {
              status,
              limit: PAGE_SIZE,
              beforeDate: cursor.beforeDate,
              beforeId: cursor.beforeId,
            }
          : {
              status,
              limit: PAGE_SIZE,
              offset: cursor.nextOffset ?? itemsRef.current.length,
            },
      );
      if (gen !== fetchGenRef.current) return;
      const page = sortIssuesNewestFirst(res.items ?? []);
      const existingIds = new Set(itemsRef.current.map((i) => i.ID));
      const appended = page.filter((i) => !existingIds.has(i.ID));
      const nextList = [...itemsRef.current, ...appended];
      setItems(nextList);
      itemsRef.current = nextList;
      applyPageMeta(res);
      setStaleWarning(null);
    } catch (err) {
      if (gen !== fetchGenRef.current) return;
      if (isAuthError(err) || (err instanceof ApiError && err.status === 401)) {
        return;
      }
      const msg = err instanceof Error ? err.message : t('issue.listFailed');
      setStaleWarning(msg || t('issue.refreshStale'));
    } finally {
      if (gen === fetchGenRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [homeStat, analysisStat, boardStatusParam, applyPageMeta, t]);

  useEffect(() => {
    const prev = window.history.scrollRestoration;
    try {
      window.history.scrollRestoration = 'manual';
    } catch {
      /* */
    }
    return () => {
      try {
        window.history.scrollRestoration = prev;
      } catch {
        /* */
      }
    };
  }, []);

  // Reset + fetch page 1 when server-side query inputs change.
  useEffect(() => {
    knownIdsRef.current = null;
    cursorRef.current = null;
    setHasMore(false);
    hasMoreRef.current = false;
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void load({ silent: true });
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  // Infinite scroll against AppShell [data-app-scroll].
  useEffect(() => {
    if (drillDown) return;
    const node = document.querySelector('[data-app-scroll]');
    if (!(node instanceof HTMLElement)) return;
    const scrollEl = node;
    function onScroll() {
      if (!hasMoreRef.current || loadingMoreRef.current) return;
      const remaining =
        scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      if (remaining <= SCROLL_LOAD_THRESHOLD_PX) {
        void loadMore();
      }
    }
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => scrollEl.removeEventListener('scroll', onScroll);
  }, [drillDown, loadMore, items.length]);

  // Restore scroll after the list has painted (not mid-fetch while height ≈ 0).
  useEffect(() => {
    if (items.length === 0) return;
    const top = pendingScrollRef.current;
    if (top <= 0) return;
    pendingScrollRef.current = 0;
    const t0 = window.requestAnimationFrame(() => restoreAppScrollTop(top));
    const t1 = window.setTimeout(() => restoreAppScrollTop(top), 50);
    const t2 = window.setTimeout(() => restoreAppScrollTop(top), 250);
    return () => {
      window.cancelAnimationFrame(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [items]);

  // Keep scroll position fresh in sessionStorage so detail navigation cannot
  // race an unmount cleanup that already sees scrollTop=0.
  useEffect(() => {
    const node = document.querySelector('[data-app-scroll]');
    if (!(node instanceof HTMLElement)) return;
    const scrollEl = node;
    let timer = 0;
    function onScroll() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        try {
          const raw = sessionStorage.getItem('karea-issues-board-ui');
          const prev = raw ? JSON.parse(raw) : {};
          sessionStorage.setItem(
            'karea-issues-board-ui',
            JSON.stringify({
              ...prev,
              listQuery,
              typeIds: [...typeIds],
              defectZoneIds: [...defectZoneIds],
              defectPartIds: [...defectPartIds],
              defectTypeIds: [...defectTypeIds],
              severities: [...severities],
              statuses: [...statuses],
              advancedOpen,
              scrollTop: scrollEl.scrollTop,
            }),
          );
        } catch {
          /* */
        }
      }, 100);
    }
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
    };
  }, [
    listQuery,
    typeIds,
    defectZoneIds,
    defectPartIds,
    defectTypeIds,
    severities,
    statuses,
    advancedOpen,
  ]);

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

  function toggleDefectZone(id: number) {
    if (homeStat || analysisStat) clearHomeStat();
    setDefectZoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setDefectPartsSelection(next: Set<number>) {
    if (homeStat || analysisStat) clearHomeStat();
    setDefectPartIds(next);
  }

  useEffect(() => {
    if (defectZoneIds.size === 0) return;
    setDefectPartIds((prev) => {
      if (prev.size === 0) return prev;
      const allowed = new Set(
        defectParts
          .filter((p) => defectZoneIds.has(p.ZoneID))
          .map((p) => p.ID),
      );
      const pruned = new Set([...prev].filter((id) => allowed.has(id)));
      return pruned.size === prev.size ? prev : pruned;
    });
  }, [defectZoneIds, defectParts]);

  function setAdvancedFiltersOpen(next: boolean) {
    setAdvancedOpen(next);
    try {
      localStorage.setItem(ADVANCED_FILTERS_OPEN_KEY, next ? '1' : '0');
    } catch {
      /* ignore quota / private mode */
    }
  }

  const advancedActiveCount = useMemo(() => {
    let n = 0;
    if (typeIds.size > 0) n += 1;
    if (defectZoneIds.size > 0) n += 1;
    if (defectPartIds.size > 0) n += 1;
    if (defectTypeIds.size > 0) n += 1;
    return n;
  }, [typeIds, defectZoneIds, defectPartIds, defectTypeIds]);

  const boardFilterActive =
    statuses.size > 0 ||
    severities.size > 0 ||
    typeIds.size > 0 ||
    defectZoneIds.size > 0 ||
    defectPartIds.size > 0 ||
    defectTypeIds.size > 0;

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (homeStat) parts.push(homeIssueStatLabel(homeStat, t));
    if (analysisStat) parts.push(analysisIssueStatLabel(analysisStat, t));
    if (!homeStat && !analysisStat) {
      if (statuses.size > 0) {
        parts.push(
          [...statuses].map((s) => issueStatusLabel(s as IssueStatus, t)).join(', '),
        );
      }
      if (severities.size > 0) {
        parts.push([...severities].map((s) => severityLabel(s, t)).join(', '));
      }
      if (advancedActiveCount > 0) {
        parts.push(t('issue.advancedFiltersActive', { n: advancedActiveCount }));
      }
    }
    return parts.filter(Boolean).join(' · ');
  }, [
    homeStat,
    analysisStat,
    statuses,
    severities,
    advancedActiveCount,
    t,
  ]);

  function clearBoardFilters() {
    setStatuses(new Set());
    setSeverities(new Set());
    setTypeIds(new Set());
    setDefectZoneIds(new Set());
    setDefectPartIds(new Set());
    setDefectTypeIds(new Set());
    if (homeStat || analysisStat) clearHomeStat();
  }

  function toggleDefectType(id: number) {
    if (homeStat || analysisStat) clearHomeStat();
    setDefectTypeIds((prev) => {
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

  const applyClientFilters = useCallback(
    (list: Issue[]): Issue[] =>
      list.filter((issue) => {
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
        if (defectZoneIds.size > 0) {
          if (issue.DefectZoneID == null || !defectZoneIds.has(issue.DefectZoneID)) {
            return false;
          }
        }
        if (defectPartIds.size > 0) {
          if (issue.DefectPartID == null || !defectPartIds.has(issue.DefectPartID)) {
            return false;
          }
        }
        if (defectTypeIds.size > 0) {
          if (issue.DefectTypeID == null || !defectTypeIds.has(issue.DefectTypeID)) {
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
    [
      listQuery,
      homeStat,
      homeStatNow,
      analysisStat,
      analysisFrom,
      analysisTo,
      typeIds,
      defectZoneIds,
      defectPartIds,
      defectTypeIds,
      severities,
      statuses,
    ],
  );

  const visible = useMemo(
    () => applyClientFilters(items),
    [items, applyClientFilters],
  );

  /** Server full list for current status param, then client filters. */
  const fetchMatchingIssues = useCallback(async (): Promise<Issue[]> => {
    const status = boardStatusParam();
    const res = await api.listIssues({ status, unlimited: true });
    return applyClientFilters(sortIssuesNewestFirst(res.items ?? []));
  }, [boardStatusParam, applyClientFilters]);

  useEffect(() => {
    let cancelled = false;
    setMatchCounting(true);
    void fetchMatchingIssues()
      .then((rows) => {
        if (!cancelled) setMatchTotal(rows.length);
      })
      .catch(() => {
        if (!cancelled) setMatchTotal(null);
      })
      .finally(() => {
        if (!cancelled) setMatchCounting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchMatchingIssues]);

  async function attachmentsFor(
    issues: Issue[],
    onProgress?: (done: number, total: number) => void,
  ) {
    const byId = new Map<
      number,
      { report: MediaAttachment[]; resolution: MediaAttachment[] }
    >();
    let done = 0;
    const total = issues.length;
    const concurrency = 8;
    let next = 0;
    async function worker() {
      while (next < issues.length) {
        const i = next++;
        const issue = issues[i]!;
        const [report, resolution] = await Promise.all([
          api.listMedia('ISSUE', String(issue.ID)),
          api.listMedia('ISSUE_RESOLUTION', String(issue.ID)),
        ]);
        byId.set(issue.ID, {
          report: report.items ?? [],
          resolution: resolution.items ?? [],
        });
        done += 1;
        onProgress?.(done, total);
      }
    }
    await Promise.all(
      Array.from(
        { length: Math.min(concurrency, Math.max(1, issues.length)) },
        () => worker(),
      ),
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
      setExportProgress(t('issue.exportFetching'));
      const rows = await fetchMatchingIssues();
      setMatchTotal(rows.length);
      setExportProgress(
        t('issue.exportAttachments', { done: 0, total: rows.length }),
      );
      const attachments = await attachmentsFor(rows, (done, total) => {
        setExportProgress(t('issue.exportAttachments', { done, total }));
      });
      setExportProgress(t('issue.exportBuilding'));
      const urls = new Map<number, string[]>();
      for (const issue of rows) {
        urls.set(
          issue.ID,
          photoUrls(attachments.get(issue.ID) ?? { report: [], resolution: [] }),
        );
      }
      const csv = buildIssuesCsv(rows, urls, t);
      downloadBlob(
        new Blob([csv], { type: 'text/csv;charset=utf-8' }),
        `issues-${exportStamp()}.csv`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('issue.exportCsvFailed'));
    } finally {
      setExporting(null);
      setExportProgress(null);
    }
  }

  async function exportZip() {
    setExporting('zip');
    setError(null);
    try {
      setExportProgress(t('issue.exportFetching'));
      const rows = await fetchMatchingIssues();
      setMatchTotal(rows.length);
      if (rows.length > ZIP_HARD_MAX_ISSUES) {
        setError(
          t('issue.zipTooLarge', { max: ZIP_HARD_MAX_ISSUES, n: rows.length }),
        );
        return;
      }
      if (rows.length >= ZIP_CONFIRM_MIN) {
        const mb = Math.max(1, Math.round(rows.length * ZIP_MB_PER_ISSUE_EST));
        const ok = window.confirm(
          t('issue.zipConfirm', { n: rows.length, mb }),
        );
        if (!ok) return;
      }
      setExportProgress(
        t('issue.exportAttachments', { done: 0, total: rows.length }),
      );
      const attachments = await attachmentsFor(rows, (done, total) => {
        setExportProgress(t('issue.exportAttachments', { done, total }));
      });
      setExportProgress(t('issue.exportBuilding'));
      const urls = new Map<number, string[]>();
      const photos: IssueExportPhoto[] = [];
      for (const issue of rows) {
        const pack = attachments.get(issue.ID) ?? { report: [], resolution: [] };
        urls.set(issue.ID, photoUrls(pack));
        photos.push(
          ...(await fetchExportPhotos(issue.ID, 'rapor', pack.report, token)),
          ...(await fetchExportPhotos(issue.ID, 'cozum', pack.resolution, token)),
        );
      }
      const csv = buildIssuesCsv(rows, urls, t);
      const zip = buildIssuesZip(csv, photos);
      downloadBlob(
        new Blob([zip as BlobPart], { type: 'application/zip' }),
        `issues-${exportStamp()}.zip`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('issue.exportZipFailed'));
    } finally {
      setExporting(null);
      setExportProgress(null);
    }
  }

  const exportCount = matchTotal ?? visible.length;
  const exportBusy = exporting !== null;

  const analysisBanner = analysisStat
    ? analysisFrom || analysisTo
      ? t('issue.analysisFilterRange', {
          label: analysisIssueStatLabel(analysisStat, t),
          range: t('analysis.to', {
            from: analysisFrom || '…',
            to: analysisTo || '…',
          }),
          n: exportCount,
        })
      : t('issue.analysisFilter', {
          label: analysisIssueStatLabel(analysisStat, t),
          n: exportCount,
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
        <div className="min-w-0">
          <h1 className="text-xl font-semibold sm:text-2xl">{t('nav.issues')}</h1>
          {updatedAt ? (
            <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
              {t('home.lastUpdated', {
                time: updatedAt.toLocaleTimeString(localeTag(locale), {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }),
              })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IssueListPrint
            matchTotal={exportCount}
            filters={printFilters}
            fetchIssues={fetchMatchingIssues}
            disabled={exportBusy || exportCount === 0}
          />
          <button
            type="button"
            disabled={exportBusy || exportCount === 0}
            onClick={() => void exportCsv()}
            className="inline-flex min-h-touch items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium hover:bg-[var(--bg-surface-2)] disabled:opacity-40"
            style={{ borderColor: 'var(--border)' }}
          >
            <FileSpreadsheet size={15} aria-hidden />
            {exporting === 'csv'
              ? t('issue.exportingCsv')
              : matchCounting
                ? t('issue.exportCounting')
                : t('issue.csvN', { n: exportCount })}
          </button>
          <button
            type="button"
            disabled={exportBusy || exportCount === 0}
            onClick={() => void exportZip()}
            className="inline-flex min-h-touch items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-40"
          >
            <Archive size={15} aria-hidden />
            {exporting === 'zip'
              ? t('issue.exportingZip')
              : matchCounting
                ? t('issue.exportCounting')
                : t('issue.zipN', { n: exportCount })}
          </button>
        </div>
      </div>

      {exportProgress ? (
        <p
          className="mt-2 text-[13px] text-[var(--text-secondary)]"
          aria-live="polite"
        >
          {exportProgress}
        </p>
      ) : null}

      {staleWarning ? (
        <div
          role="alert"
          className="mt-3 rounded-lg border px-3 py-2 text-[13px] font-medium"
          style={{
            borderColor: 'color-mix(in srgb, #C62222 55%, var(--border))',
            backgroundColor: 'color-mix(in srgb, #C62222 12%, var(--bg-surface-1))',
            color: 'var(--text-primary)',
          }}
        >
          {t('issue.refreshStale')}
          {staleWarning && staleWarning !== t('issue.refreshStale')
            ? ` (${staleWarning})`
            : null}
        </div>
      ) : null}

      {soundUnlockNeeded ? (
        <div
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-[13px] text-[var(--text-secondary)]">
            {t('issue.soundUnlockHint')}
          </p>
          <button
            type="button"
            className="inline-flex min-h-touch items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium hover:bg-[var(--bg-surface-2)]"
            style={{ borderColor: 'var(--border)' }}
            onClick={() => {
              void (async () => {
                const ok = await unlockCriticalAudio();
                if (ok) setSoundUnlockNeeded(false);
              })();
            }}
          >
            <Volume2 size={15} aria-hidden />
            {t('issue.soundUnlock')}
          </button>
        </div>
      ) : null}

      {(homeStat || analysisStat) && (
        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-[var(--bg-surface-1)] px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-[13px] text-[var(--text-primary)]">
            {homeStat
              ? t('issue.homeFilter', {
                  label: homeIssueStatLabel(homeStat, t),
                  n: exportCount,
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
        className="mt-4 min-w-0 space-y-4 overflow-hidden rounded-xl border bg-[var(--bg-surface-1)] p-4"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="min-w-0 space-y-4">
          <div className="w-full max-w-md">
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

          {compactFilters ? (
            <div className="min-w-0 space-y-2">
              <button
                type="button"
                onClick={() => setFiltersOpen((o) => !o)}
                className="focus-ring-quiet flex min-h-touch w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left text-[13px] font-semibold hover:bg-[var(--bg-surface-2)]"
                style={{ color: 'var(--text-primary)' }}
                aria-expanded={filtersOpen}
              >
                <span>{t('issue.filters')}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform ${
                    filtersOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden
                />
              </button>
              {!filtersOpen && (boardFilterActive || drillDown) && filterSummary ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <p className="min-w-0 flex-1 text-[12px] text-[var(--text-secondary)]">
                    {t('issue.filtersActive', { summary: filterSummary })}
                  </p>
                  <button
                    type="button"
                    onClick={clearBoardFilters}
                    className="min-h-touch shrink-0 rounded-lg border px-3 py-1 text-[12px] font-medium hover:bg-[var(--bg-surface-2)]"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {t('issue.clearFilters')}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {(!compactFilters || filtersOpen) ? (
            <>
          <div className="flex min-w-0 flex-wrap gap-x-6 gap-y-4">
            <div className="min-w-0 max-w-full">
              <p
                className="mb-2 text-[13px] font-semibold"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('issue.status')}
              </p>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((status) => {
                  const selected =
                    !homeStat && !analysisStat && statuses.has(status);
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
            <div className="min-w-0">
              <p
                className="mb-2 text-[13px] font-semibold"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('severity.label')}
              </p>
              <div className="flex flex-wrap gap-2">
                {SEVERITIES.map((s) => {
                  const selected =
                    !homeStat && !analysisStat && severities.has(s);
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

        <div className="min-w-0 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <button
            type="button"
            onClick={() => setAdvancedFiltersOpen(!advancedOpen)}
            className="focus-ring-quiet flex min-h-touch w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left text-[13px] font-semibold hover:bg-[var(--bg-surface-2)]"
            style={{ color: 'var(--text-primary)' }}
            aria-expanded={advancedOpen}
          >
            <span>
              {!advancedOpen && advancedActiveCount > 0
                ? t('issue.advancedFiltersActive', { n: advancedActiveCount })
                : t('issue.advancedFilters')}
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform ${
                advancedOpen ? 'rotate-180' : ''
              }`}
              aria-hidden
            />
          </button>

          {advancedOpen ? (
            <div className="mt-3 min-w-0 space-y-4">
              <div className="flex w-full min-w-0 flex-wrap items-start gap-x-5 gap-y-4">
                <div className="min-w-0 shrink-0">
                  <p
                    className="mb-2 text-[13px] font-semibold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {t('issue.type')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {issueTypes.map((itype) => {
                      const selected =
                        !homeStat && !analysisStat && typeIds.has(itype.ID);
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

                <div className="min-w-0 shrink-0">
                  <p
                    className="mb-2 text-[13px] font-semibold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {t('issue.filterZone')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {defectZones.map((z) => {
                      const selected =
                        !homeStat && !analysisStat && defectZoneIds.has(z.ID);
                      const label =
                        locale === 'en'
                          ? z.NameEN || z.NameTR
                          : z.NameTR || z.NameEN;
                      return (
                        <button
                          key={z.ID}
                          type="button"
                          onClick={() => toggleDefectZone(z.ID)}
                          className={TYPE_CHIP_CLASS}
                          style={typeChipStyle(selected)}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="min-w-[14rem] flex-1 grow basis-[16rem]">
                  <p
                    className="mb-2 text-[13px] font-semibold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {t('issue.filterPart')}
                  </p>
                  <PartMultiSelect
                    parts={defectParts}
                    selectedIds={defectPartIds}
                    onChange={setDefectPartsSelection}
                    zoneIds={defectZoneIds}
                    disabled={Boolean(homeStat || analysisStat)}
                  />
                </div>
              </div>

              <div className="min-w-0 max-w-full">
                <p
                  className="mb-2 text-[13px] font-semibold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t('issue.filterDefectType')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {defectTypes.map((ty) => {
                    const selected =
                      !homeStat && !analysisStat && defectTypeIds.has(ty.ID);
                    const label =
                      locale === 'en'
                        ? ty.NameEN || ty.NameTR
                        : ty.NameTR || ty.NameEN;
                    return (
                      <button
                        key={ty.ID}
                        type="button"
                        onClick={() => toggleDefectType(ty.ID)}
                        className={TYPE_CHIP_CLASS}
                        style={typeChipStyle(selected)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>
            </>
          ) : null}
        </div>
      </div>

      {error && (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}

      <div className="mt-4">
        <IssueList
          items={visible}
          highlightedIds={highlightedIds}
          onStatusChanged={() => void load()}
        />
        {loadingMore ? (
          <p
            className="mt-3 text-center text-[13px] text-[var(--text-secondary)]"
            aria-live="polite"
          >
            {t('issue.loadingMore')}
          </p>
        ) : null}
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
  token: string | null,
): Promise<IssueExportPhoto[]> {
  const out: IssueExportPhoto[] = [];
  let index = 0;
  for (const item of items) {
    index += 1;
    const url = mediaFileUrl(item.storage_path);
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
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
