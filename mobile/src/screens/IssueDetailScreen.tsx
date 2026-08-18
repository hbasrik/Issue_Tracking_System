import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { ApiError, api, type Issue } from '../api/client';
import {
  Badge,
  Card,
  ErrorText,
  Loading,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
} from '../components/ui';
import { SeverityIndicator } from '../components/SeverityIndicator';
import { useTheme } from '../theme/ThemeProvider';
import { statusColors } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

function nextOperatorStatus(status: Issue['Status']): Issue['Status'] | null {
  if (status === 'OPEN') return 'IN_PROGRESS';
  if (status === 'IN_PROGRESS') return 'DONE';
  return null; // DONE / APPROVED — no operator transition (APPROVED is manager-only)
}

export default function IssueDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'IssueDetail'>>();
  const { tokens } = useTheme();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const i = await api.getIssue(route.params.id);
      setIssue(i);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issue');
    }
  }, [route.params.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function advance() {
    if (!issue) return;
    const next = nextOperatorStatus(issue.Status);
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateIssueStatus(issue.ID, next);
      await load();
    } catch (err) {
      // Surface backend message plainly (invalid transition, forbidden, etc.)
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!issue && !error) return <Loading />;

  const next = issue ? nextOperatorStatus(issue.Status) : null;

  return (
    <Screen>
      <Title>Issue #{route.params.id}</Title>
      {issue ? (
        <>
          <Subtitle>{issue.VIN}</Subtitle>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Badge
                label={issue.Status}
                color={
                  issue.Status === 'OPEN'
                    ? statusColors.issueOpen
                    : issue.Status === 'IN_PROGRESS'
                      ? statusColors.issueInProgress
                      : statusColors.issueResolved
                }
              />
              <SeverityIndicator severity={issue.Severity} size="md" />
            </View>
            <Text style={{ color: tokens.textPrimary, marginTop: 12, fontSize: 15 }}>
              {issue.Description}
            </Text>
          </Card>
          {next ? (
            <View style={{ marginTop: 20 }}>
              <PrimaryButton
                label={
                  busy
                    ? 'Updating…'
                    : next === 'IN_PROGRESS'
                      ? 'Mark In Progress'
                      : 'Mark Done'
                }
                onPress={advance}
                disabled={busy}
              />
            </View>
          ) : (
            <Subtitle>
              {issue.Status === 'DONE'
                ? 'Awaiting Manager/Admin approval (not available here)'
                : 'No further operator transitions'}
            </Subtitle>
          )}
        </>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}
