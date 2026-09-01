import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Pressable,
  Text,
  View,
} from 'react-native';
import {
  CompositeNavigationProp,
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, type Issue, type IssueType } from '../api/client';
import { IssueCard } from '../components/IssueCard';
import { listKeyboardDismissProps } from '../components/keyboard';
import {
  ErrorText,
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
  matchesHomeIssueStat,
  type HomeIssueStatKey,
} from '../lib/homeIssueStats';
import { issueMatchesListQuery } from '../lib/issueVinFilter';
import { issueTypeChipLabel } from '../lib/issueTypeLabel';
import { apiErrorMessage } from '../lib/password';
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

function issueCreatedMs(issue: Issue): number {
  return Date.parse(issue.CreatedAt || issue.IssueDate || '') || 0;
}

export default function MyIssuesScreen() {
  const { tokens } = useTheme();
  const { t } = useI18n();
  const navigation = useNavigation<MyIssuesNavigation>();
  const route = useRoute<RouteProp<MainDrawerParamList, 'MyIssues'>>();
  const [items, setItems] = useState<Issue[]>([]);
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [listQuery, setListQuery] = useState('');
  const [severities, setSeverities] = useState<Set<SeverityLevel>>(new Set());
  const [statuses, setStatuses] = useState<Set<IssueStatus>>(new Set());
  const [typeIds, setTypeIds] = useState<Set<number>>(new Set());
  const [homeStat, setHomeStat] = useState<HomeIssueStatKey | undefined>(
    route.params?.homeStat,
  );
  /** Frozen at preset apply so list length matches the Home card at tap time. */
  const [homeStatNow, setHomeStatNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [issuesRes, typesRes] = await Promise.all([
        api.listIssues(),
        api.listIssueTypes().catch(() => ({ items: [] as IssueType[] })),
      ]);
      const list = (issuesRes.items ?? []).slice().sort((a, b) => {
        const ta = issueCreatedMs(a);
        const tb = issueCreatedMs(b);
        if (tb !== ta) return tb - ta;
        return b.ID - a.ID;
      });
      setItems(list);
      setIssueTypes(typesRes.items ?? []);
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Apply (or clear) the Home deep-link whenever the route param changes.
  useEffect(() => {
    const next = route.params?.homeStat;
    setHomeStat(next);
    if (next) {
      setHomeStatNow(new Date());
      setStatuses(new Set());
      setSeverities(new Set());
      setTypeIds(new Set());
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
      if (severities.size > 0 && !severities.has(issue.Severity)) return false;
      if (statuses.size > 0 && !statuses.has(issue.Status)) return false;
      return true;
    });
  }, [items, listQuery, typeIds, severities, statuses, homeStat, homeStatNow]);

  return (
    <Screen padded={false}>
      <FlatList
        data={filtered}
        keyExtractor={(i) => String(i.ID)}
        {...listKeyboardDismissProps}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          <Pressable onPress={Keyboard.dismiss} accessible={false} style={{ marginBottom: 12 }}>
            <Title>{t('nav.issues')}</Title>
            <Subtitle>{t('issue.listSubtitle')}</Subtitle>

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
                marginTop: 16,
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

            <Text
              style={{
                color: tokens.textSecondary,
                fontWeight: '600',
                fontSize: 13,
                marginTop: 16,
                marginBottom: 8,
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
                      minHeight: 36,
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
                        color: selected ? tokens.textPrimary : tokens.textSecondary,
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

            <Text
              style={{
                color: tokens.textSecondary,
                fontWeight: '600',
                fontSize: 13,
                marginTop: 16,
                marginBottom: 8,
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

            <Text
              style={{
                color: tokens.textSecondary,
                fontWeight: '600',
                fontSize: 13,
                marginTop: 16,
                marginBottom: 8,
              }}
            >
              {t('issue.status')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {STATUSES.map((status) => {
                const selected = !homeStat && statuses.has(status);
                const color = issueStatusColor(status);
                const fill = selected ? color : tokens.bgPage;
                const ink = selected ? inkOn(color) : readableOn(color, tokens.bgPage);
                return (
                  <Pressable
                    key={status}
                    onPress={() => toggleStatus(status)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={{
                      paddingHorizontal: 12,
                      minHeight: 36,
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

            {error ? <ErrorText>{error}</ErrorText> : null}
            {loading ? <Loading /> : null}
          </Pressable>
        }
        ListEmptyComponent={
          loading ? null : <Subtitle>{t('issue.noMatch')}</Subtitle>
        }
        renderItem={({ item }) => (
          <IssueCard
            issue={item}
            onPress={() => {
              Keyboard.dismiss();
              navigation.navigate('IssueDetail', { id: item.ID });
            }}
          />
        )}
      />
    </Screen>
  );
}
