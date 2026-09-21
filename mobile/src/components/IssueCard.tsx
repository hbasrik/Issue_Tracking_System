import { useMemo, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  formatIssueOpenDuration,
  issueCardIsCompact,
  issueOpenDurationMs,
  ISSUE_CARD_PHOTO_ASPECT,
  severityMessageKey,
} from '../../../shared/issueCardLayout';
import { mediaFileUrl, mediaThumbUrl, type Issue } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Badge, Card } from './ui';
import { SeverityIndicator } from './SeverityIndicator';
import { useTheme } from '../theme/ThemeProvider';
import { statusColors } from '../theme/tokens';
import { useI18n } from '../i18n';
import { issueStatusColor, issueStatusLabel } from '../lib/issueStatus';
import { defectLabels } from '../lib/issueDetailCopy';

export function IssueCard({
  issue,
  onPress,
  hideVin = false,
  /** Override width (e.g. list container). Defaults to window width. */
  layoutWidth,
}: {
  issue: Issue;
  onPress: () => void;
  hideVin?: boolean;
  layoutWidth?: number;
}) {
  const { tokens } = useTheme();
  const { t, locale } = useI18n();
  const { token } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const width = layoutWidth ?? windowWidth;
  const compact = issueCardIsCompact(width);
  const [lightbox, setLightbox] = useState(false);
  const [now] = useState(() => Date.now());

  const defect = defectLabels(issue, t, locale);
  const duration = formatIssueOpenDuration(
    issueOpenDurationMs(issue, now),
    locale,
  );
  const sevKey = severityMessageKey(issue.Severity);
  const sevLabel = sevKey ? t(sevKey) : issue.Severity;
  const hasPhoto = Boolean(issue.ReportPhotoPath);
  const authHeaders = token
    ? { Authorization: `Bearer ${token}` }
    : undefined;

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

  function openPhoto() {
    if (hasPhoto) setLightbox(true);
  }

  const photo = (
    <Pressable
      onPress={openPhoto}
      disabled={!hasPhoto}
      accessibilityRole="button"
      accessibilityLabel={
        hasPhoto ? t('issue.photoFullscreen') : t('issue.noPhoto')
      }
      style={{
        ...photoBox,
        backgroundColor: tokens.bgSurface2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {hasPhoto ? (
        <Image
          source={{
            uri: mediaThumbUrl(issue.ReportPhotoPath!),
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
            {t('issue.noPhoto')}
          </Text>
        </View>
      )}
    </Pressable>
  );

  const body = (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        flex: 1,
        minWidth: 0,
        padding: compact ? 0 : 12,
        gap: compact ? 4 : 6,
      }}
    >
      <Text
        style={{
          color: tokens.textPrimary,
          fontSize: compact ? 14 : 15,
          fontWeight: '600',
          lineHeight: compact ? 18 : 20,
        }}
        numberOfLines={2}
      >
        {issue.Description?.trim() || t('common.emDash')}
      </Text>
      <Text style={{ color: tokens.textSecondary, fontSize: 12 }} numberOfLines={1}>
        {defect.listLine}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {!hideVin ? (
          <Text
            style={{
              color: tokens.accent,
              fontWeight: '700',
              fontFamily: 'monospace',
              fontSize: compact ? 12 : 13,
            }}
          >
            …{issue.VIN.slice(-5)}
          </Text>
        ) : null}
        <Text
          style={{
            color: tokens.textSecondary,
            fontSize: compact ? 12 : 13,
            fontVariant: ['tabular-nums'],
          }}
        >
          {duration}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <SeverityIndicator severity={issue.Severity} />
          <Text
            style={{
              color:
                issue.Severity === 'CRITICAL'
                  ? statusColors.severityCritical
                  : issue.Severity === 'MEDIUM'
                    ? statusColors.severityMedium
                    : statusColors.severityLow,
              fontWeight: '600',
              fontSize: compact ? 12 : 13,
            }}
          >
            {sevLabel}
          </Text>
        </View>
        <Badge
          label={issueStatusLabel(issue.Status, t)}
          color={issueStatusColor(issue.Status)}
        />
      </View>
    </Pressable>
  );

  return (
    <>
      <Card
        style={{
          flex: 1,
          padding: compact ? 12 : 0,
          marginTop: 0,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            flexDirection: compact ? 'row' : 'column',
            gap: compact ? 12 : 0,
            alignItems: compact ? 'stretch' : undefined,
            flex: 1,
          }}
        >
          {photo}
          {body}
        </View>
      </Card>

      <Modal
        visible={lightbox}
        transparent
        animationType="fade"
        onRequestClose={() => setLightbox(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.88)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16,
          }}
          onPress={() => setLightbox(false)}
        >
          <Pressable
            style={{
              position: 'absolute',
              top: 48,
              right: 20,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: 'rgba(255,255,255,0.15)',
            }}
            onPress={() => setLightbox(false)}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>
              {t('common.close')}
            </Text>
          </Pressable>
          {hasPhoto ? (
            <Image
              source={{
                uri: mediaFileUrl(issue.ReportPhotoPath!),
                headers: authHeaders,
              }}
              style={{
                width: Dimensions.get('window').width - 32,
                height: Dimensions.get('window').height * 0.75,
              }}
              resizeMode="contain"
            />
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}
