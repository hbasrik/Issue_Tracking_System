import { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { ChevronRight, Clock } from 'lucide-react-native';
import {
  formatIssueOpenDuration,
  issueCardIsCompact,
  issueOpenDurationMs,
  ISSUE_CARD_PHOTO_ASPECT,
  severityMessageKey,
} from '../../../shared/issueCardLayout';
import { mediaThumbUrl, mediaCardThumbUrl, type Issue } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Badge, Card } from './ui';
import {
  SeverityIndicator,
  normalizeSeverity,
  severityFillColor,
} from './SeverityIndicator';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n';
import { issueStatusColor, issueStatusLabel } from '../lib/issueStatus';
import { defectLabels } from '../lib/issueDetailCopy';

export function IssueCard({
  issue,
  onPress,
  hideVin = false,
  /** Override width (e.g. list container). Defaults to window width. */
  layoutWidth,
  highlighted = false,
  /** When false, defer photo network until the row is viewable. */
  loadPhoto = true,
  /** False → severity shows as the bar icon only (vehicle issue list). */
  showSeverityLabel = true,
}: {
  issue: Issue;
  onPress: () => void;
  hideVin?: boolean;
  layoutWidth?: number;
  highlighted?: boolean;
  loadPhoto?: boolean;
  showSeverityLabel?: boolean;
}) {
  const { tokens } = useTheme();
  const { t, locale } = useI18n();
  const { token } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const width = layoutWidth ?? windowWidth;
  const compact = issueCardIsCompact(width);
  const [now] = useState(() => Date.now());

  const defect = defectLabels(issue, t, locale);
  const duration = formatIssueOpenDuration(
    issueOpenDurationMs(issue, now),
    locale,
  );
  const sevKey = severityMessageKey(issue.Severity);
  const sevLabel = sevKey ? t(sevKey) : issue.Severity;
  const sevLevel = normalizeSeverity(issue.Severity);
  const sevColor = sevLevel ? severityFillColor(sevLevel) : tokens.textPrimary;
  const hasPhoto = Boolean(issue.ReportPhotoPath);
  const authHeaders = token
    ? { Authorization: `Bearer ${token}` }
    : undefined;
  const listImageUri =
    hasPhoto && issue.ReportPhotoPath
      ? compact
        ? mediaThumbUrl(issue.ReportPhotoPath)
        : mediaCardThumbUrl(issue.ReportPhotoPath)
      : null;

  const photoBox = useMemo(() => {
    if (compact) {
      return { width: 64, height: 64, borderRadius: 8 };
    }
    return {
      width: '100%' as const,
      aspectRatio: ISSUE_CARD_PHOTO_ASPECT,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
    };
  }, [compact]);

  // Part of the card press target: fullscreen viewing lives on the detail
  // screen only.
  const photo = (
    <View
      testID="issue-card-photo"
      style={{
        ...photoBox,
        backgroundColor: tokens.bgSurface2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {hasPhoto && listImageUri && loadPhoto ? (
        <Image
          source={{
            uri: listImageUri,
            headers: authHeaders,
          }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      ) : (
        <View style={{ alignItems: 'center', paddingHorizontal: 6 }}>
          <Text
            style={{
              color: tokens.textSecondary,
              fontSize: compact ? 10 : 12,
              fontWeight: '600',
              textAlign: 'center',
            }}
          >
            {hasPhoto && !loadPhoto ? '…' : t('issue.noPhoto')}
          </Text>
        </View>
      )}
    </View>
  );

  const metaSize = compact ? 12 : 13;

  // Corners: description ↖ status ↗, classification + open time ↙ severity ↘.
  const body = (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        padding: compact ? 0 : 12,
        gap: compact ? 6 : 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <Text
          style={{
            flex: 1,
            minWidth: 0,
            color: tokens.textPrimary,
            fontSize: compact ? 14 : 15,
            fontWeight: '600',
            lineHeight: compact ? 19 : 20,
          }}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {issue.Description?.trim() || t('common.emDash')}
        </Text>
        <View style={{ flexShrink: 0 }}>
          <Badge
            label={issueStatusLabel(issue.Status, t)}
            color={issueStatusColor(issue.Status)}
          />
        </View>
      </View>
      <Text
        style={{ color: tokens.textSecondary, fontSize: 12, minWidth: 0 }}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {defect.listLine}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          minWidth: 0,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            flexShrink: 1,
            minWidth: 0,
          }}
        >
          {!hideVin ? (
            <Text
              style={{
                color: tokens.accent,
                fontWeight: '700',
                fontFamily: 'monospace',
                fontSize: metaSize,
                flexShrink: 1,
              }}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              …{issue.VIN.slice(-5)}
            </Text>
          ) : null}
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, minWidth: 0 }}
            accessible
            accessibilityLabel={`${t('issue.openDuration')}: ${duration}`}
          >
            <Clock size={metaSize + 1} color={tokens.textSecondary} strokeWidth={2} />
            <Text
              style={{
                color: tokens.textSecondary,
                fontSize: metaSize,
                fontVariant: ['tabular-nums'],
                flexShrink: 1,
              }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {duration}
            </Text>
          </View>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
          }}
        >
          <SeverityIndicator severity={issue.Severity} size="md" />
          {showSeverityLabel ? (
            <Text
              style={{
                color: sevColor,
                fontWeight: '600',
                fontSize: metaSize,
                maxWidth: 72,
              }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {sevLabel}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );

  const chevron = (
    <View
      style={{
        alignSelf: 'center',
        paddingRight: compact ? 0 : 8,
        flexShrink: 0,
      }}
    >
      <ChevronRight size={18} color={tokens.textSecondary} strokeWidth={2} />
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        opacity: pressed ? 0.82 : 1,
      })}
    >
      <Card
        style={{
          flex: compact ? undefined : 1,
          padding: compact ? 12 : 0,
          marginTop: 0,
          overflow: 'hidden',
          // Always keep a 1px edge — never pass borderWidth: undefined
          // (can wipe StyleSheet.card border on some RN flatten paths).
          borderWidth: highlighted ? 2 : 1,
          borderColor: highlighted ? sevColor : tokens.border,
          ...(highlighted
            ? {
                shadowColor: sevColor,
                shadowOpacity: 0.45,
                shadowRadius: 8,
                elevation: 4,
              }
            : null),
        }}
      >
        <View
          style={{
            flexDirection: compact ? 'row' : 'column',
            gap: compact ? 12 : 0,
            alignItems: compact ? 'flex-start' : undefined,
            flex: compact ? undefined : 1,
          }}
        >
          {photo}
          {compact ? (
            <>
              {body}
              {chevron}
            </>
          ) : (
            <View style={{ flexDirection: 'row', flex: 1 }}>
              {body}
              {chevron}
            </View>
          )}
        </View>
      </Card>
    </Pressable>
  );
}
