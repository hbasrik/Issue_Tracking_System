import { Image, Pressable, Text, View } from 'react-native';
import { mediaThumbUrl, type Issue } from '../api/client';
import { Card, Badge } from './ui';
import { SeverityIndicator } from './SeverityIndicator';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n';
import { formatDateTimeShort } from '../../../shared/i18n';
import { issueStatusColor, issueStatusLabel } from '../lib/issueStatus';
import { reporterFallback } from '../lib/issueDetailCopy';

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
  const { t, locale } = useI18n();

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {issue.ReportPhotoPath ? (
            <Image
              source={{ uri: mediaThumbUrl(issue.ReportPhotoPath) }}
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
              <Text style={{ color: tokens.textSecondary, fontSize: 11 }}>{t('common.emDash')}</Text>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 6,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  flex: 1,
                  minWidth: 0,
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
                <Badge
                  label={issueStatusLabel(issue.Status, t)}
                  color={issueStatusColor(issue.Status)}
                />
              </View>
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
              {formatDateTimeShort(issue.CreatedAt || issue.IssueDate, locale)}
            </Text>
            <Text
              style={{ color: tokens.textSecondary, marginTop: 4, fontSize: 13 }}
              numberOfLines={1}
            >
              {issue.ReporterName || reporterFallback(t, issue.IssueReporterID)}
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

