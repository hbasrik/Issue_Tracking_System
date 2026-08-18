import { Image, Pressable, Text, View } from 'react-native';
import { mediaFileUrl, type Issue } from '../api/client';
import { Card, Badge } from './ui';
import { SeverityIndicator } from './SeverityIndicator';
import { useTheme } from '../theme/ThemeProvider';
import { statusColors } from '../theme/tokens';

function statusColor(s: string): string {
  if (s === 'OPEN') return statusColors.issueOpen;
  if (s === 'IN_PROGRESS') return statusColors.issueInProgress;
  return statusColors.issueResolved;
}

function statusLabel(s: Issue['Status']): string {
  if (s === 'OPEN') return 'Açık';
  if (s === 'IN_PROGRESS') return 'İşlemde';
  if (s === 'DONE') return 'Tamamlandı';
  if (s === 'CONDITIONAL_APPROVED') return 'Şartlı Onay';
  if (s === 'APPROVED') return 'Kalite Onay';
  return s;
}

function formatCreatedAt(iso?: string): string {
  if (!iso || iso.startsWith('0001')) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function IssueCard({
  issue,
  onPress,
  hideVin = false,
}: {
  issue: Issue;
  onPress: () => void;
  hideVin?: boolean;
}) {
  const { tokens } = useTheme();

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {issue.ReportPhotoPath ? (
            <Image
              source={{ uri: mediaFileUrl(issue.ReportPhotoPath) }}
              style={{
                width: 64,
                height: 64,
                borderRadius: 8,
                backgroundColor: tokens.bgSurface2,
              }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 8,
                backgroundColor: tokens.bgSurface2,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: tokens.textSecondary, fontSize: 11 }}>—</Text>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
                flexWrap: 'wrap',
              }}
            >
              <Text
                style={{
                  color: tokens.textSecondary,
                  fontSize: 12,
                  fontWeight: '600',
                }}
              >
                #{issue.ID}
              </Text>
              <Badge label={statusLabel(issue.Status)} color={statusColor(issue.Status)} />
              <SeverityIndicator severity={issue.Severity} />
            </View>
            {!hideVin ? (
              <Text style={{ color: tokens.textPrimary, fontWeight: '600' }}>
                …{issue.VIN.slice(-5)}
              </Text>
            ) : null}
            <Text
              style={{ color: tokens.textSecondary, marginTop: 2, fontSize: 12 }}
            >
              {formatCreatedAt(issue.CreatedAt || issue.IssueDate)}
            </Text>
            <Text
              style={{ color: tokens.textSecondary, marginTop: 4, fontSize: 13 }}
              numberOfLines={2}
            >
              {issue.Description}
            </Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

