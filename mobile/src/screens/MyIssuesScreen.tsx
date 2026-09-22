import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
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

function issueReportedMs(issue: Issue): number {
  return Date.parse(issueReportedAtIso(issue) || '') || 0;
}

export default function MyIssuesScreen() {
  const { tokens } = useTheme();
  const { t, locale } = useI18n();
  const navigation = useNavigation<MyIssuesNavigation>();
  const route = useRoute<RouteProp<MainDrawerParamList, 'MyIssues'>>();
  const { snapshot } = useReferenceCache();
  const [items, setItems] = useState<Issue[]>([]);
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([]);
  const [defectZones, setDefectZones] = useState<DefectZone[]>([]);
  const [defectParts, setDefectParts] = useState<DefectPart[]>([]);
  const [defectTypes, setDefectTypes] = useState<DefectType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [offlineHint, setOfflineHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [listQuery, setListQuery] = useState('');
  const [severities, setSeverities] = useState<Set<SeverityLevel>>(new Set());
  const [statuses, setStatuses] = useState<Set<IssueStatus>>(new Set());
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
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [staleWarning, setStaleWarning] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<Set<number>>(new Set());
  const { width: windowWidth } = useWindowDimensions();
  const listContentWidth = Math.max(0, windowWidth - 32);
  const columns = issueCardColumnCount(listContentWidth);
  const knownIdsRef = useRef<Set<number> | null>(null);
  const hasLoadedRef = useRef(false);
  const listRef = useRef<FlatList<Issue>>(null);
  const scrollOffsetRef = useRef(0);
  const highlightTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    void AsyncStorage.getItem(ADVANCED_FILTERS_OPEN_KEY).then((raw) => {
      if (raw === '1') setAdvancedOpen(true);
    });
  }, []);

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

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setError(null);
      setOfflineHint(null);
    }
    try {
      const [issuesRes, typesRes, zonesRes, partsRes, defectTypesRes] = await Promise.all([
        api.listIssues(),
        api.listIssueTypes().catch(() => ({ items: snapshot.issueTypes })),
        api.listDefectCatalogZones().catch(() => ({ items: snapshot.zones })),
        api.listDefectCatalogParts().catch(() => ({ items: snapshot.parts })),
        api.listDefectCatalogTypes().catch(() => ({ items: snapshot.types })),
      ]);
      const list = (issuesRes.items ?? []).slice().sort((a, b) => {
        const ta = issueReportedMs(a);
        const tb = issueReportedMs(b);
        if (tb !== ta) return tb - ta;
        return b.ID - a.ID;
      });
      const { knownIds, newCriticalIds } = detectNewCriticalIds(
        knownIdsRef.current,
        list,
      );
      knownIdsRef.current = knownIds;
      setItems(list);
      setIssueTypes(typesRes.items ?? snapshot.issueTypes);
      setDefectZones(zonesRes.items ?? snapshot.zones);
      setDefectParts(partsRes.items ?? snapshot.parts);
      setDefectTypes(defectTypesRes.items ?? snapshot.types);
      setUpdatedAt(new Date());
      setStaleWarning(null);
      hasLoadedRef.current = true;
      if (newCriticalIds.length > 0) {
        flashCritical(newCriticalIds);
        void playCriticalAlertIfEnabled();
      }
    } catch (err) {
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
      if (!silent) setLoading(false);
    }
  }, [t, snapshot, flashCritical]);

  useFocusEffect(
    useCallback(() => {
      void load({ silent: hasLoadedRef.current });
      const id = setInterval(() => {
        void load({ silent: true });
      }, AUTO_REFRESH_MS);
      const offset = scrollOffsetRef.current;
      if (offset > 0) {
        requestAnimationFrame(() => {
          listRef.current?.scrollToOffset({ offset, animated: false });
        });
      }
      return () => clearInterval(id);
    }, [load]),
  );

  // Apply (or clear) the Home deep-link whenever the route param changes.
  useEffect(() => {
    const next = isMobileHomeIssueStatKey(route.params?.homeStat)
      ? route.params.homeStat
      : undefined;
    setHomeStat(next);
    if (next) {
      setHomeStatNow(new Date());
      setStatuses(new Set());
      setSeverities(new Set());
      setTypeIds(new Set());
      setDefectZoneIds(new Set());
      setDefectPartIds(new Set());
      setDefectTypeIds(new Set());
      setListQuery('');
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

  return (
    <Screen padded={false}>
      <FlatList
        ref={listRef}
        key={`issues-cols-${columns}`}
        data={filtered}
        keyExtractor={(i) => String(i.ID)}
        numColumns={columns}
        columnWrapperStyle={
          columns > 1
            ? { gap: 12, marginBottom: 12, alignItems: 'stretch' }
            : undefined
        }
        {...listKeyboardDismissProps}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        ItemSeparatorComponent={
          columns === 1
            ? () => <View style={{ height: 12 }} />
            : undefined
        }
        ListHeaderComponent={
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

            <View style={{ marginTop: 12, gap: 12 }}>
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

            {error ? <ErrorText>{error}</ErrorText> : null}
            {offlineHint ? <InfoText>{offlineHint}</InfoText> : null}
            {loading && !hasLoadedRef.current ? <Loading /> : null}
          </Pressable>
        }
        ListEmptyComponent={
          loading && !hasLoadedRef.current ? null : (
            <Subtitle>{t('issue.noMatch')}</Subtitle>
          )
        }
        renderItem={({ item }) => (
          <View style={{ flex: 1, marginBottom: columns > 1 ? 0 : 0 }}>
            <IssueCard
              issue={item}
              layoutWidth={listContentWidth}
              highlighted={highlightedIds.has(item.ID)}
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
