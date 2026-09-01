import { useState } from 'react';
import {
  Pressable,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { api, type LocalFile } from '../api/client';
import {
  Badge,
  Card,
  ErrorText,
  OutlineButton,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
  AppTextInput,
} from '../components/ui';
import {
  SeverityIndicator,
  severityFillColor,
  severityLabel,
  type SeverityLevel,
} from '../components/SeverityIndicator';
import { useTheme } from '../theme/ThemeProvider';
import { statusColors } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';
import {
  DismissKeyboardScrollView,
  iosDoneAccessoryProps,
} from '../components/keyboard';
import { prepareUploadImage } from '../lib/prepareUploadImage';
import { apiErrorMessage } from '../lib/password';
import { useI18n } from '../i18n';
import { formatDateTime } from '../../../shared/i18n';

const SEVERITIES: SeverityLevel[] = ['CRITICAL', 'MEDIUM', 'LOW'];

/** Issue girme formu — §3.3. Soft-warning: after save, return to station screen (no block). */
export default function IssueReportScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'IssueReport'>>();
  const navigation = useNavigation();
  const { tokens } = useTheme();
  const { t, locale } = useI18n();
  const { vin, stationStepId, stationId, stationName, stationStepName } =
    route.params;

  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'CRITICAL' | 'MEDIUM' | 'LOW' | null>(null);
  const [photo, setPhoto] = useState<LocalFile | null>(null);
  const [createdIssueId, setCreatedIssueId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(t('issueDetail.galleryDenied'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) {
      try {
        setPhoto(await prepareUploadImage(asset));
      } catch (err) {
        setError(apiErrorMessage(err, t));
      }
    }
  }

  async function uploadPhoto(issueId: number): Promise<boolean> {
    if (!photo) return true;
    try {
      await api.uploadMedia('ISSUE', String(issueId), photo);
      return true;
    } catch (err) {
      setError(
        t('report.savedPhotoFailed', {
          id: issueId,
          msg: apiErrorMessage(err, t),
        }),
      );
      return false;
    }
  }

  async function submit() {
    setError(null);
    if (!description.trim()) {
      setError(t('report.descRequired'));
      return;
    }
    if (!severity) {
      setError(t('report.severityRequired'));
      return;
    }
    setBusy(true);
    try {
      let issueId = createdIssueId;
      if (issueId == null) {
        const issue = await api.createIssue({
          vin,
          source_type: 'STATION_STEP',
          source_station_step_id: stationStepId,
          station_id: stationId,
          severity,
          description: description.trim(),
        });
        issueId = issue.ID;
        setCreatedIssueId(issueId);
      }
      if (await uploadPhoto(issueId)) {
        navigation.goBack();
      }
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded={false}>
      <DismissKeyboardScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Title>{t('nav.reportIssue')}</Title>
        <Subtitle>{t('report.stationStepSubtitle')}</Subtitle>

        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Badge label={vin} color={tokens.accent} />
            <Badge label={stationName} color={statusColors.info} />
          </View>
          <Text style={{ color: tokens.textSecondary, marginTop: 10, fontSize: 13 }}>
            {t('report.readOnly', { name: stationStepName })}
          </Text>
          <Text style={{ color: tokens.textSecondary, marginTop: 4, fontSize: 12 }}>
            {formatDateTime(new Date().toISOString(), locale)}
          </Text>
        </Card>

        <Text style={{ color: tokens.textSecondary, marginTop: 16, fontSize: 13 }}>
          {t('issueDetail.descriptionStar')}
        </Text>
        <AppTextInput
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          {...iosDoneAccessoryProps}
          style={{
            marginTop: 6,
            minHeight: 100,
            borderWidth: 1,
            borderRadius: 10,
            padding: 12,
            color: tokens.textPrimary,
            borderColor: tokens.border,
            backgroundColor: tokens.bgSurface1,
            fontSize: 15,
            textAlignVertical: 'top',
          }}
        />

        <Text style={{ color: tokens.textSecondary, marginTop: 16, fontSize: 13 }}>
          {t('severity.label')} *
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {SEVERITIES.map((s) => {
            const selected = severity === s;
            const color = severityFillColor(s);
            return (
              <Pressable
                key={s}
                onPress={() => setSeverity(s)}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: selected ? color : tokens.border,
                  backgroundColor: selected ? color + '33' : tokens.bgSurface1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <SeverityIndicator severity={s} />
                <Text
                  style={{
                    color: selected ? color : tokens.textSecondary,
                    fontWeight: '600',
                    fontSize: 11,
                  }}
                >
                  {severityLabel(s, t)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ marginTop: 16 }}>
          <OutlineButton
            label={
              photo
                ? t('report.pickedPhoto', { name: photo.name })
                : t('report.addPhotoOptional')
            }
            onPress={pickPhoto}
          />
        </View>

        {error ? <ErrorText>{error}</ErrorText> : null}

        <View style={{ marginTop: 24 }}>
          <PrimaryButton
            label={
              busy
                ? t('common.saving')
                : createdIssueId != null
                  ? t('report.retryUpload')
                  : t('report.saveContinue')
            }
            onPress={submit}
            disabled={busy}
          />
        </View>
        {createdIssueId != null ? (
          <View style={{ marginTop: 12 }}>
            <OutlineButton
              label={t('report.continueNoPhoto')}
              onPress={() => navigation.goBack()}
            />
          </View>
        ) : null}
      </DismissKeyboardScrollView>
    </Screen>
  );
}
