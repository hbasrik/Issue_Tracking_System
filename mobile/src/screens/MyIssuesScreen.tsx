import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CompositeNavigationProp,
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, type DefectPart, type DefectType, type DefectZone, type Issue, type IssueType } from '../api/client';
import { IssueCard } from '../components/IssueCard';
import { PartMultiSelectFilter } from '../components/PartMultiSelectFilter';
import { listKeyboardDismissProps } from '../components/keyboard';
import {
  ErrorText,
  InfoText,
  Loading,
  OutlineButton,
  Screen,
  Subtitle,
  Title,
  AppTextInput,
} from '../components/ui';
import { SeverityIndicator, severityFillColor, severityLabel, type SeverityLevel } from '../components/SeverityIndicator';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n';
import { inkOn, mixColors, readableOn } from '../theme/tokens';
import { issueStatusColor, issueStatusLabel } from '../lib/issueStatus';
import {
  homeIssueStatLabel,
  isMobileHomeIssueStatKey,
  matchesHomeIssueStat,
  type MobileHomeIssueStatKey,
} from '../lib/homeIssueStats';
import { issueMatchesListQuery } from '../lib/issueVinFilter';
import { issueTypeChipLabel } from '../lib/issueTypeLabel';
import {
  readIssuesBoardUI,
  writeIssuesBoardUI,
} from '../lib/issuesBoardState';
import { loadFailureMessage } from '../offline/userFacingError';
import { useReferenceCache } from '../offline/ReferenceCacheProvider';
import { isTransportError } from '../../../shared/networkError';
import { issueCardColumnCount, issueReportedAtIso } from '../../../shared/issueCardLayout';
import { detectNewCriticalIds } from '../../../shared/newCriticalIds';
import { playCriticalAlertIfEnabled } from '../lib/criticalAlertSound';
import type { MainDrawerParamList, RootStackParamList } from '../navigation/types';

type IssueStatus = Issue['Status'];

type MyIssuesNavigation = CompositeNavigationProp<
  DrawerNavigationProp<MainDrawerParamList, 'MyIssues'>,
  NativeStackNavigationProp<RootStackParamList>
>;

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
const DEFAULT_BOARD_STATUSES: IssueStatus[] = [];

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

function statusQueryParam(statuses: Set<IssueStatus>): string | undefined {
  if (statuses.size === 0) return undefined;
  return [...statuses].join(',');
}

function resolveInitialStatuses(
  saved: Awaited<ReturnType<typeof readIssuesBoardUI>>,
): Set<IssueStatus> {
  if (!saved) return new Set(DEFAULT_BOARD_STATUSES);
  if (Object.prototype.hasOwnProperty.call(saved, 'statuses')) {
    return new Set((saved.statuses ?? []) as IssueStatus[]);
  }
  return new Set(DEFAULT_BOARD_STATUSES);
}

export default function MyIssuesScreen() {
  const { tokens } = useTheme();
  const { t, locale } = useI18n();
  const navigation = useNavigation<MyIssuesNavigation>();
  const route = useRoute<RouteProp<MainDrawerParamList, 'MyIssues'>>();
  const { snapshot } = useReferenceCache();
  const [prefsReady, setPrefsReady] = useState(false);
  const [items, setItems] = useState<Issue[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([]);
  const [defectZones, setDefectZones] = useState<DefectZone[]>([]);
  const [defectParts, setDefectParts] = useState<DefectPart[]>([]);
  const [defectTypes, setDefectTypes] = useState<DefectType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [offlineHint, setOfflineHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [listQuery, setListQuery] = useState('');
  const [severities, setSeverities] = useState<Set<SeverityLevel>>(new Set());
  const [statuses, setStatuses] = useState<Set<IssueStatus>>(
    () => new Set(DEFAULT_BOARD_STATUSES),
  );
  const [typeIds, setTypeIds] = useState<Set<number>>(new Set());
  const [defectZoneIds, setDefectZoneIds] = useState<Set<number>>(new Set());
  const [defectPartIds, setDefectPartIds] = useState<Set<number>>(new Set());
  const [defectTypeIds, setDefectTypeIds] = useState<Set<number>>(new Set());
  const [homeStat, setHomeStat] = useState<MobileHomeIssueStatKey | undefined>(
    isMobileHomeIssueStatKey(route.params?.homeStat)
      ? route.params?.homeStat
      : undefined,
  );
  /** Frozen at preset apply so list length matches the Home card at tap time. */
  const [homeStatNow, setHomeStatNow] = useState(() => new Date());
  const [advancedOpen, setAdvancedOpen] = useState(false);
  /** Status / severity / advanced — collapsed by default on mobile. */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [staleWarning, setStaleWarning] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<Set<number>>(new Set());
  const { width: windowWidth } = useWindowDimensions();
  const listContentWidth = Math.max(0, windowWidth - 32);
  const columns = issueCardColumnCount(listContentWidth);
  const knownIdsRef = useRef<Set<number> | null>(null);
  const hasLoadedRef = useRef(false);
  const listRef = useRef<FlashListRef<Issue>>(null);
  const scrollOffsetRef = useRef(0);
  const highlightTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
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
  const [photoReadyIds, setPhotoReadyIds] = useState<Set<number>>(() => new Set());
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 12,
    minimumViewTime: 40,
  }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: { item?: Issue }[] }) => {
      setPhotoReadyIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const token of viewableItems) {
          const id = token.item?.ID;
          if (typeof id === 'number' && !next.has(id)) {
            next.add(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    },
  ).current;

  itemsRef.current = items;
  hasMoreRef.current = hasMore;

  // Hydrate board UI from AsyncStorage before the first fetch.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await readIssuesBoardUI();
      if (cancelled) return;
      if (saved) {
        setListQuery(saved.listQuery ?? '');
        setTypeIds(new Set(saved.typeIds ?? []));
        setDefectZoneIds(new Set(saved.defectZoneIds ?? []));
        setDefectPartIds(new Set(saved.defectPartIds ?? []));
        setDefectTypeIds(new Set(saved.defectTypeIds ?? []));
        setSeverities(new Set((saved.severities ?? []) as SeverityLevel[]));
        setStatuses(resolveInitialStatuses(saved));
        setAdvancedOpen(Boolean(saved.advancedOpen));
        if (typeof saved.scrollTop === 'number' && saved.scrollTop > 0) {
          scrollOffsetRef.current = saved.scrollTop;
        }
      } else {
        setStatuses(new Set(DEFAULT_BOARD_STATUSES));
      }
      setPrefsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistBoardUI = useCallback(() => {
    void writeIssuesBoardUI({
      listQuery,
      typeIds: [...typeIds],
      defectZoneIds: [...defectZoneIds],
      defectPartIds: [...defectPartIds],
      defectTypeIds: [...defectTypeIds],
      severities: [...severities],
      statuses: [...statuses],
      advancedOpen,
      scrollTop: scrollOffsetRef.current,
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
    if (!prefsReady) return;
    persistBoardUI();
  }, [prefsReady, persistBoardUI]);

  useEffect(() => {
    return () => {
      for (const id of highlightTimersRef.current) clearTimeout(id);
    };
  }, []);

  function setAdvancedFiltersOpen(next: boolean) {
    setAdvancedOpen(next);
    void AsyncStorage.setItem(ADVANCED_FILTERS_OPEN_KEY, next ? '1' : '0');
  }

  const flashCritical = useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    setHighlightedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    const timer = setTimeout(() => {
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
      api.listIssueTypes().catch(() => ({ items: snapshot.issueTypes })),
      api.listDefectCatalogZones().catch(() => ({ items: snapshot.zones })),
      api.listDefectCatalogParts().catch(() => ({ items: snapshot.parts })),
      api.listDefectCatalogTypes().catch(() => ({ items: snapshot.types })),
    ]);
    setIssueTypes(typesRes.items ?? snapshot.issueTypes);
    setDefectZones(zonesRes.items ?? snapshot.zones);
    setDefectParts(partsRes.items ?? snapshot.parts);
    setDefectTypes(defectTypesRes.items ?? snapshot.types);
    catalogsLoadedRef.current = true;
  }, [snapshot]);

  const boardStatusParam = useCallback(() => {
    if (homeStat) return undefined;
    return statusQueryParam(statuses);
  }, [homeStat, statuses]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) {
        setLoading(true);
        setError(null);
        setOfflineHint(null);
      }
      const status = boardStatusParam();
      const isDrill = Boolean(homeStat);
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
        const [issuesRes] = await Promise.all([issuesPromise, catalogPromise]);
        if (gen !== fetchGenRef.current) return;
        const page = sortIssuesNewestFirst(issuesRes.items ?? []);

        let nextList: Issue[];
        if (silent && !isDrill) {
          nextList = mergeFirstPage(itemsRef.current, page);
        } else {
          nextList = page;
          if (!isDrill) {
            applyPageMeta(issuesRes);
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
        hasLoadedRef.current = true;
        if (newCriticalIds.length > 0) {
          flashCritical(newCriticalIds);
          void playCriticalAlertIfEnabled();
        }
      } catch (err) {
        if (gen !== fetchGenRef.current) return;
        setIssueTypes(snapshot.issueTypes);
        setDefectZones(snapshot.zones);
        setDefectParts(snapshot.parts);
        setDefectTypes(snapshot.types);
        if (silent) {
          setStaleWarning(t('issue.refreshStale'));
        } else if (isTransportError(err)) {
          setOfflineHint(t('offline.liveUnavailable'));
        } else {
          const split = loadFailureMessage(err, t);
          setError(split.error);
          setOfflineHint(split.offlineHint);
        }
      } finally {
        if (!silent && gen === fetchGenRef.current) setLoading(false);
      }
    },
    [
      t,
      snapshot,
      flashCritical,
      boardStatusParam,
      homeStat,
      loadCatalogs,
      applyPageMeta,
    ],
  );

  const loadMore = useCallback(async () => {
    if (homeStat) return;
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
      if (isTransportError(err)) {
        setStaleWarning(t('issue.refreshStale'));
      } else {
        const split = loadFailureMessage(err, t);
        setStaleWarning(split.error || t('issue.refreshStale'));
      }
    } finally {
      if (gen === fetchGenRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [homeStat, boardStatusParam, applyPageMeta, t]);

  // Reset + fetch page 1 when server-side query inputs change (after prefs hydrate).
  useEffect(() => {
    if (!prefsReady) return;
    knownIdsRef.current = null;
    cursorRef.current = null;
    setHasMore(false);
    hasMoreRef.current = false;
    void load({ silent: hasLoadedRef.current });
  }, [load, prefsReady]);

  useFocusEffect(
    useCallback(() => {
      if (!prefsReady) return;
      const id = setInterval(() => {
        void load({ silent: true });
      }, AUTO_REFRESH_MS);
      const offset = scrollOffsetRef.current;
      if (offset > 0) {
        requestAnimationFrame(() => {
          listRef.current?.scrollToOffset({ offset, animated: false });
        });
      }
      return () => {
        clearInterval(id);
        persistBoardUI();
      };
    }, [load, prefsReady, persistBoardUI]),
  );

  // Apply (or clear) the Home deep-link whenever the route param changes.
  useEffect(() => {
    const next = isMobileHomeIssueStatKey(route.params?.homeStat)
      ? route.params.homeStat
      : undefined;
    setHomeStat(next);
    if (next) {
      setHomeStatNow(new Date());
    }
  }, [route.params?.homeStat]);

  function clearHomeStat() {
    setHomeStat(undefined);
    navigation.setParams({ homeStat: undefined });
  }

  function toggleSeverity(s: SeverityLevel) {
    if (homeStat) clearHomeStat();
    setSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function toggleStatus(s: IssueStatus) {
    if (homeStat) clearHomeStat();
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function toggleType(id: number) {
    if (homeStat) clearHomeStat();
    setTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleDefectZone(id: number) {
    if (homeStat) clearHomeStat();
    setDefectZoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setDefectPartsSelection(next: Set<number>) {
    if (homeStat) clearHomeStat();
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

  function toggleDefectType(id: number) {
    if (homeStat) clearHomeStat();
    setDefectTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    if (!homeStat) {
      if (statuses.size > 0) {
        parts.push(
          [...statuses].map((s) => issueStatusLabel(s, t)).join(', '),
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
  }, [homeStat, statuses, severities, advancedActiveCount, t]);

  function clearBoardFilters() {
    setStatuses(new Set());
    setSeverities(new Set());
    setTypeIds(new Set());
    setDefectZoneIds(new Set());
    setDefectPartIds(new Set());
    setDefectTypeIds(new Set());
    if (homeStat) clearHomeStat();
  }

  const filtered = useMemo(() => {
    return items.filter((issue) => {
      if (homeStat) {
        return matchesHomeIssueStat(issue, homeStat, homeStatNow);
      }
      if (!issueMatchesListQuery(issue, listQuery)) return false;
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
      if (severities.size > 0 && !severities.has(issue.Severity)) return false;
      if (statuses.size > 0 && !statuses.has(issue.Status)) return false;
      return true;
    });
  }, [
    items,
    listQuery,
    typeIds,
    defectZoneIds,
    defectPartIds,
    defectTypeIds,
    severities,
    statuses,
    homeStat,
    homeStatNow,
  ]);

  const listHeader = (
    <Pressable onPress={Keyboard.dismiss} accessible={false} style={{ marginBottom: 12 }}>
      <Title>{t('nav.issues')}</Title>
      <Subtitle>{t('issue.listSubtitle')}</Subtitle>
      {updatedAt ? (
        <Text style={{ color: tokens.textSecondary, fontSize: 12, marginTop: 4 }}>
          {t('home.lastUpdated', {
            time: updatedAt.toLocaleTimeString(locale === 'en' ? 'en-GB' : 'tr-TR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
          })}
        </Text>
      ) : null}
      {staleWarning ? (
        <Text
          style={{
            color: tokens.textPrimary,
            fontSize: 13,
            fontWeight: '600',
            marginTop: 8,
            padding: 10,
            borderRadius: 8,
            backgroundColor: mixColors('#C62222', tokens.bgSurface1, 12),
          }}
        >
          {staleWarning}
        </Text>
      ) : null}

      {homeStat ? (
        <View
          style={{
            marginTop: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <Text style={{ color: tokens.textPrimary, flex: 1, fontSize: 13 }}>
            {t('issue.homeFilter', {
              label: homeIssueStatLabel(homeStat, t),
              n: filtered.length,
            })}
          </Text>
          <OutlineButton label={t('common.clear')} onPress={clearHomeStat} />
        </View>
      ) : null}

      <Text
        style={{
          color: tokens.textSecondary,
          fontWeight: '600',
          fontSize: 13,
          marginTop: 12,
        }}
      >
        {t('issue.searchLabel')}
      </Text>
      <AppTextInput
        value={listQuery}
        onChangeText={(q) => {
          if (homeStat) clearHomeStat();
          setListQuery(q);
        }}
        placeholder={t('issue.searchPlaceholder')}
        placeholderTextColor={tokens.textSecondary}
        autoCorrect={false}
        autoCapitalize="none"
        multiline={false}
        numberOfLines={1}
        returnKeyType="search"
        blurOnSubmit
        submitBehavior="blurAndSubmit"
        onSubmitEditing={() => Keyboard.dismiss()}
        style={{
          marginTop: 8,
          borderWidth: 1,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontSize: 15,
          minHeight: 44,
          backgroundColor: tokens.bgSurface1,
          borderColor: tokens.border,
          color: tokens.textPrimary,
        }}
      />

      <Pressable
        onPress={() => setFiltersOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: filtersOpen }}
        style={{
          marginTop: 12,
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 8,
        }}
      >
        <Text
          style={{
            color: tokens.textPrimary,
            fontWeight: '700',
            fontSize: 13,
          }}
        >
          {t('issue.filters')}
        </Text>
        <Text style={{ color: tokens.textSecondary, fontSize: 16 }}>
          {filtersOpen ? '▴' : '▾'}
        </Text>
      </Pressable>

      {!filtersOpen && (boardFilterActive || homeStat) && filterSummary ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: tokens.border,
          }}
        >
          <Text
            style={{
              color: tokens.textSecondary,
              fontSize: 12,
              flex: 1,
            }}
            numberOfLines={2}
          >
            {t('issue.filtersActive', { summary: filterSummary })}
          </Text>
          <OutlineButton
            label={t('issue.clearFilters')}
            onPress={clearBoardFilters}
          />
        </View>
      ) : null}

      {filtersOpen ? (
      <>
      <View style={{ marginTop: 4, gap: 12 }}>
        <View>
          <Text
            style={{
              color: tokens.textSecondary,
              fontWeight: '600',
              fontSize: 13,
              marginBottom: 6,
            }}
          >
            {t('issue.status')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {STATUSES.map((status) => {
              const selected = !homeStat && statuses.has(status);
              const color = issueStatusColor(status);
              const fill = selected ? color : tokens.bgPage;
              const ink = selected
                ? inkOn(color)
                : readableOn(color, tokens.bgPage);
              return (
                <Pressable
                  key={status}
                  onPress={() => toggleStatus(status)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={{
                    paddingHorizontal: 12,
                    minHeight: 44,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: color,
                    backgroundColor: fill,
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: ink,
                      fontSize: 12,
                      fontWeight: '600',
                    }}
                  >
                    {issueStatusLabel(status, t)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text
            style={{
              color: tokens.textSecondary,
              fontWeight: '600',
              fontSize: 13,
              marginBottom: 6,
            }}
          >
            {t('severity.label')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SEVERITIES.map((s) => {
              const selected = !homeStat && severities.has(s);
              const color = severityFillColor(s);
              const name = severityLabel(s, t);
              return (
                <Pressable
                  key={s}
                  onPress={() => toggleSeverity(s)}
                  accessibilityRole="button"
                  accessibilityLabel={name}
                  accessibilityState={{ selected }}
                  style={{
                    minHeight: 44,
                    minWidth: 44,
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 10,
                    backgroundColor: selected
                      ? mixColors(color, tokens.bgSurface1, 22)
                      : 'transparent',
                  }}
                >
                  <SeverityIndicator severity={s} />
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <Pressable
        onPress={() => setAdvancedFiltersOpen(!advancedOpen)}
        accessibilityRole="button"
        accessibilityState={{ expanded: advancedOpen }}
        style={{
          marginTop: 14,
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 8,
          borderTopWidth: 1,
          borderTopColor: tokens.border,
        }}
      >
        <Text
          style={{
            color: tokens.textPrimary,
            fontWeight: '700',
            fontSize: 13,
          }}
        >
          {!advancedOpen && advancedActiveCount > 0
            ? t('issue.advancedFiltersActive', { n: advancedActiveCount })
            : t('issue.advancedFilters')}
        </Text>
        <Text style={{ color: tokens.textSecondary, fontSize: 16 }}>
          {advancedOpen ? '▴' : '▾'}
        </Text>
      </Pressable>

      {advancedOpen ? (
        <View style={{ gap: 12, paddingBottom: 4 }}>
          <View>
            <Text
              style={{
                color: tokens.textSecondary,
                fontWeight: '600',
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              {t('issue.type')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {issueTypes.map((it) => {
                const selected = !homeStat && typeIds.has(it.ID);
                return (
                  <Pressable
                    key={it.ID}
                    onPress={() => toggleType(it.ID)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={{
                      paddingHorizontal: 12,
                      minHeight: 44,
                      borderRadius: 999,
                      backgroundColor: mixColors(
                        tokens.textPrimary,
                        tokens.bgSurface1,
                        selected ? 14 : 6,
                      ),
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: selected
                          ? tokens.textPrimary
                          : tokens.textSecondary,
                        fontSize: 12,
                        fontWeight: '600',
                      }}
                    >
                      {issueTypeChipLabel(it.Name)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <Text
              style={{
                color: tokens.textSecondary,
                fontWeight: '600',
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              {t('issue.filterZone')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {defectZones.map((z) => {
                const selected = !homeStat && defectZoneIds.has(z.ID);
                const label =
                  locale === 'en'
                    ? z.NameEN || z.NameTR
                    : z.NameTR || z.NameEN;
                return (
                  <Pressable
                    key={z.ID}
                    onPress={() => toggleDefectZone(z.ID)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={{
                      paddingHorizontal: 12,
                      minHeight: 44,
                      borderRadius: 999,
                      backgroundColor: mixColors(
                        tokens.textPrimary,
                        tokens.bgSurface1,
                        selected ? 14 : 6,
                      ),
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: selected
                          ? tokens.textPrimary
                          : tokens.textSecondary,
                        fontSize: 12,
                        fontWeight: '600',
                      }}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <Text
              style={{
                color: tokens.textSecondary,
                fontWeight: '600',
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              {t('issue.filterPart')}
            </Text>
            <PartMultiSelectFilter
              parts={defectParts}
              selectedIds={defectPartIds}
              onChange={setDefectPartsSelection}
              zoneIds={defectZoneIds}
              disabled={Boolean(homeStat)}
            />
          </View>

          <View>
            <Text
              style={{
                color: tokens.textSecondary,
                fontWeight: '600',
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              {t('issue.filterDefectType')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {defectTypes.map((ty) => {
                const selected = !homeStat && defectTypeIds.has(ty.ID);
                const label =
                  locale === 'en'
                    ? ty.NameEN || ty.NameTR
                    : ty.NameTR || ty.NameEN;
                return (
                  <Pressable
                    key={ty.ID}
                    onPress={() => toggleDefectType(ty.ID)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={{
                      paddingHorizontal: 12,
                      minHeight: 44,
                      borderRadius: 999,
                      backgroundColor: mixColors(
                        tokens.textPrimary,
                        tokens.bgSurface1,
                        selected ? 14 : 6,
                      ),
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: selected
                          ? tokens.textPrimary
                          : tokens.textSecondary,
                        fontSize: 12,
                        fontWeight: '600',
                      }}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      ) : null}
      </>
      ) : null}

      {error ? <ErrorText>{error}</ErrorText> : null}
      {offlineHint ? <InfoText>{offlineHint}</InfoText> : null}
      {loading && !hasLoadedRef.current ? <Loading /> : null}
    </Pressable>
  );

  return (
    <Screen padded={false}>
      <FlashList
        ref={listRef}
        key={`issues-cols-${columns}`}
        data={filtered}
        keyExtractor={(i) => String(i.ID)}
        numColumns={columns}
        {...listKeyboardDismissProps}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onEndReached={() => {
          if (!homeStat) void loadMore();
        }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={listHeader}
        ListFooterComponent={
          loadingMore ? (
            <View
              style={{
                paddingVertical: 16,
                alignItems: 'center',
                gap: 8,
              }}
            >
              <ActivityIndicator color={tokens.accent} />
              <Text style={{ color: tokens.textSecondary, fontSize: 12 }}>
                {t('issue.loadingMore')}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading && !hasLoadedRef.current ? null : (
            <Subtitle>{t('issue.noMatch')}</Subtitle>
          )
        }
        renderItem={({ item }) => (
          <View
            style={{
              flex: columns > 1 ? 1 : undefined,
              marginBottom: 12,
              paddingHorizontal: columns > 1 ? 6 : 0,
            }}
          >
            <IssueCard
              issue={item}
              layoutWidth={listContentWidth}
              highlighted={highlightedIds.has(item.ID)}
              loadPhoto={photoReadyIds.has(item.ID)}
              onPress={() => {
                Keyboard.dismiss();
                navigation.navigate('IssueDetail', { id: item.ID });
              }}
            />
          </View>
        )}
      />
    </Screen>
  );
}
