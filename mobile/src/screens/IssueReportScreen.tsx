import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { ApiError, api, type LocalFile } from '../api/client';
import {
  Badge,
  Card,
  ErrorText,
  OutlineButton,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
} from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import { statusColors } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

const SEVERITIES = [
  { value: 'CRITICAL', label: 'Critical', color: statusColors.severityCritical },
  { value: 'MEDIUM', label: 'Medium', color: statusColors.severityMedium },
  { value: 'LOW', label: 'Low', color: statusColors.severityLow },
] as const;

/** Hata girme formu — §3.3. Soft-warning: after save, return to station screen (no block). */
export default function IssueReportScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'IssueReport'>>();
  const navigation = useNavigation();
  const { tokens } = useTheme();
  const { vin, stationStepId, stationId, stationName, stationStepName } =
    route.params;

  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'CRITICAL' | 'MEDIUM' | 'LOW' | null>(null);
  const [photo, setPhoto] = useState<LocalFile | null>(null);
  // Set once the issue exists, so a failed photo upload can be retried without
  // creating a second issue.
  const [createdIssueId, setCreatedIssueId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Photo permission denied');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) {
      setPhoto({
        uri: asset.uri,
        name: asset.fileName || `issue-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
    }
  }

  /**
   * Attaches the picked photo to an issue. media_attachments is keyed by an
   * existing entity, so this can only run once the issue has an id.
   */
  async function uploadPhoto(issueId: number): Promise<boolean> {
    if (!photo) return true;
    try {
      await api.uploadMedia('ISSUE', String(issueId), photo);
      return true;
    } catch (err) {
      setError(
        `Hata #${issueId} kaydedildi, fotoğraf yüklenemedi: ${
          err instanceof Error ? err.message : 'upload failed'
        }`,
      );
      return false;
    }
  }

  async function submit() {
    setError(null);
    if (!description.trim()) {
      setError('Description is required');
      return;
    }
    if (!severity) {
      setError('Severity is required');
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
        // Soft-warning UX: return immediately — station screen stays navigable
        navigation.goBack();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create issue');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Title>Hata Bildir</Title>
        <Subtitle>Station step failure report</Subtitle>

        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Badge label={vin} color={tokens.accent} />
            <Badge label={stationName} color={statusColors.info} />
          </View>
          <Text style={{ color: tokens.textSecondary, marginTop: 10, fontSize: 13 }}>
            {stationStepName} (read-only)
          </Text>
          <Text style={{ color: tokens.textSecondary, marginTop: 4, fontSize: 12 }}>
            {new Date().toLocaleString()}
          </Text>
        </Card>

        <Text style={{ color: tokens.textSecondary, marginTop: 16, fontSize: 13 }}>
          Description *
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
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
          Severity *
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {SEVERITIES.map((s) => {
            const selected = severity === s.value;
            return (
              <Pressable
                key={s.value}
                onPress={() => setSeverity(s.value)}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: selected ? s.color : tokens.border,
                  backgroundColor: selected ? s.color + '33' : tokens.bgSurface1,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: selected ? s.color : tokens.textSecondary, fontWeight: '600', fontSize: 12 }}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ marginTop: 16 }}>
          <OutlineButton
            label={
              photo
                ? `Fotoğraf seçildi: ${photo.name} (değiştir)`
                : 'Fotoğraf ekle (opsiyonel)'
            }
            onPress={pickPhoto}
          />
        </View>

        {error ? <ErrorText>{error}</ErrorText> : null}

        <View style={{ marginTop: 24 }}>
          <PrimaryButton
            label={
              busy
                ? 'Saving…'
                : createdIssueId != null
                  ? 'Fotoğrafı Tekrar Yükle'
                  : 'Hatayı Kaydet ve Devam Et'
            }
            onPress={submit}
            disabled={busy}
          />
        </View>
        {createdIssueId != null ? (
          <View style={{ marginTop: 12 }}>
            <OutlineButton
              label="Fotoğrafsız devam et"
              onPress={() => navigation.goBack()}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
