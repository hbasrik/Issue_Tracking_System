import { useCallback, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ApiError,
  api,
  mediaFileUrl,
  type Issue,
  type IssueStatusHistoryEntry,
  type LocalFile,
  type MediaAttachment,
} from '../api/client';
import {
  Badge,
  Card,
  ErrorText,
  Loading,
  OutlineButton,
  PrimaryButton,
  Screen,
  SectionHeading,
  Subtitle,
  AppTextInput,
} from '../components/ui';
import { SeverityIndicator } from '../components/SeverityIndicator';
import { VehicleIdentity } from '../components/VehicleIdentity';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';
import { useAuth } from '../auth/AuthProvider';
import { Perm } from '../auth/permissions';
import { issueStatusColor, issueStatusLabel } from '../lib/issueStatus';
import { prepareUploadImage } from '../lib/prepareUploadImage';
import {
  DismissKeyboardScrollView,
  iosDoneAccessoryProps,
} from '../components/keyboard';
import { issueDetailCopy, issueStationLabel } from '../lib/issueDetailCopy';
import type { RootStackParamList } from '../navigation/types';

function nextOperatorStatus(status: Issue['Status']): Issue['Status'] | null {
  if (status === 'OPEN') return 'IN_PROGRESS';
  if (status === 'IN_PROGRESS') return 'DONE';
  return null;
}

function formatDate(iso?: string): string {
  if (!iso || iso.startsWith('0001')) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('tr-TR');
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { tokens } = useTheme();
  return (
    <View style={{ marginTop: space[3] }}>
      <Text style={{ color: tokens.textSecondary, fontSize: 12 }}>{label}</Text>
      <Text
        style={{
          color: tokens.textPrimary,
          fontSize: 15,
          fontWeight: '600',
          marginTop: 2,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export default function IssueDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'IssueDetail'>>();
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  const { has } = useAuth();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [history, setHistory] = useState<IssueStatusHistoryEntry[]>([]);
  const [reportPhotos, setReportPhotos] = useState<MediaAttachment[]>([]);
  const [resolutionPhotos, setResolutionPhotos] = useState<MediaAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showDoneForm, setShowDoneForm] = useState(false);
  const [solutionText, setSolutionText] = useState('');
  const [resolutionPhoto, setResolutionPhoto] = useState<LocalFile | null>(null);
  const [resolutionUploaded, setResolutionUploaded] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const id = route.params.id;
      const [i, hist, report, resolution] = await Promise.all([
        api.getIssue(id),
        api.getIssueHistory(id).catch(() => ({ items: [] as IssueStatusHistoryEntry[] })),
        api.listMedia('ISSUE', String(id)),
        api.listMedia('ISSUE_RESOLUTION', String(id)),
      ]);
      setIssue(i);
      setHistory(hist.items ?? []);
      setReportPhotos(report.items ?? []);
      setResolutionPhotos(resolution.items ?? []);
      if ((resolution.items ?? []).length > 0) {
        setResolutionUploaded(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Issue yüklenemedi');
    }
  }, [route.params.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function pickResolution(from: 'library' | 'camera') {
    if (from === 'library') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError('Galeri izni reddedildi');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (asset) {
        try {
          setResolutionPhoto(await prepareUploadImage(asset));
          setResolutionUploaded(false);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Fotoğraf dönüştürülemedi',
          );
        }
      }
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Kamera izni reddedildi');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) {
      try {
        setResolutionPhoto(await prepareUploadImage(asset));
        setResolutionUploaded(false);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Fotoğraf dönüştürülemedi',
        );
      }
    }
  }

  async function uploadResolutionPhoto(issueId: number): Promise<boolean> {
    if (!resolutionPhoto) {
      setError('Çözüm fotoğrafı zorunlu');
      return false;
    }
    try {
      await api.uploadMedia('ISSUE_RESOLUTION', String(issueId), resolutionPhoto);
      setResolutionUploaded(true);
      return true;
    } catch (err) {
      setError(
        `Çözüm fotoğrafı yüklenemedi: ${
          err instanceof Error ? err.message : 'yükleme başarısız'
        }`,
      );
      setResolutionUploaded(false);
      return false;
    }
  }

  async function advanceToInProgress() {
    if (!issue) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateIssueStatus(issue.ID, 'IN_PROGRESS');
      setShowDoneForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function completeDone() {
    if (!issue) return;
    const desc = solutionText.trim();
    if (!resolutionPhoto && !resolutionUploaded) {
      setError('Çözüm fotoğrafı zorunlu — kamera veya galeriden ekleyin');
      return;
    }
    if (!desc) {
      setError('Açıklama (solution_description) zorunlu');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (!resolutionUploaded) {
        const ok = await uploadResolutionPhoto(issue.ID);
        if (!ok) return;
      }
      await api.updateIssueStatus(issue.ID, 'DONE', desc);
      setShowDoneForm(false);
      setSolutionText('');
      setResolutionPhoto(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!issue && !error) return <Loading />;

  async function applyStatus(status: Issue['Status']) {
    if (!issue) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateIssueStatus(issue.ID, status);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const next = issue ? nextOperatorStatus(issue.Status) : null;
  const canMarkDone = issue?.Status === 'IN_PROGRESS' && has(Perm.IssueTransitionProgress);
  const canApprove = issue?.Status === 'DONE' && has(Perm.IssueTransitionApprove);
  const canConditional =
    issue?.Status === 'DONE' && has(Perm.IssueTransitionConditionalApprove);

  return (
    <Screen padded={false}>
      <DismissKeyboardScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 48 }}>
        {issue ? (
          <View style={{ gap: space[4] }}>
            <Card style={{ marginTop: 0 }}>
              <VehicleIdentity vin={issue.VIN} variant="hero" />
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[2],
                  marginTop: space[4],
                }}
              >
                <SeverityIndicator severity={issue.Severity} size="md" />
                <Badge
                  label={issueStatusLabel(issue.Status)}
                  color={issueStatusColor(issue.Status)}
                />
              </View>
              <Text
                style={{
                  color: tokens.textPrimary,
                  fontSize: 17,
                  fontWeight: '600',
                  lineHeight: 24,
                  marginTop: space[5],
                }}
              >
                {issue.Description}
              </Text>
              <InfoRow
                label={issueDetailCopy.reporter}
                value={issue.ReporterName || `kullanıcı #${issue.IssueReporterID}`}
              />
              <InfoRow
                label={issueDetailCopy.issueType}
                value={issue.IssueTypeName || '—'}
              />
              <InfoRow
                label={issueDetailCopy.station}
                value={issueStationLabel(issue)}
              />
              <InfoRow
                label={issueDetailCopy.reportedAt}
                value={formatDate(issue.IssueDate || issue.CreatedAt)}
              />
              {issue.SolutionDescription?.trim() ? (
                <InfoRow
                  label={issueDetailCopy.solution}
                  value={issue.SolutionDescription.trim()}
                />
              ) : null}

              {next === 'IN_PROGRESS' && has(Perm.IssueTransitionProgress) ? (
                <View style={{ marginTop: space[5] }}>
                  <PrimaryButton
                    label={busy ? 'Güncelleniyor…' : 'İşlemde'}
                    onPress={() => void advanceToInProgress()}
                    disabled={busy}
                  />
                </View>
              ) : null}

              {canMarkDone && !showDoneForm ? (
                <View style={{ marginTop: space[5] }}>
                  <PrimaryButton
                    label="Tamamlandı"
                    onPress={() => {
                      setShowDoneForm(true);
                      setError(null);
                    }}
                    disabled={busy}
                  />
                </View>
              ) : null}

              {canMarkDone && showDoneForm ? (
                <View style={{ marginTop: space[5] }}>
                  <Text
                    style={{
                      color: tokens.textPrimary,
                      fontWeight: '700',
                      fontSize: 16,
                      marginBottom: 8,
                    }}
                  >
                    Tamamlama kanıtı *
                  </Text>
                  <Subtitle>
                    Önce çözüm fotoğrafını yükleyin, sonra durumu Tamamlandı yapın
                  </Subtitle>

                  <Text
                    style={{
                      color: tokens.textSecondary,
                      fontWeight: '600',
                      fontSize: 13,
                      marginTop: 12,
                    }}
                  >
                    Çözüm fotoğrafı *
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <View style={{ flex: 1 }}>
                      <OutlineButton
                        label="Kamera"
                        onPress={() => void pickResolution('camera')}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <OutlineButton
                        label="Galeri"
                        onPress={() => void pickResolution('library')}
                      />
                    </View>
                  </View>
                  {resolutionPhoto ? (
                    <View style={{ marginTop: 8 }}>
                      <Image
                        source={{ uri: resolutionPhoto.uri }}
                        style={{
                          width: '100%',
                          height: 160,
                          borderRadius: 10,
                          backgroundColor: tokens.bgSurface2,
                        }}
                        resizeMode="cover"
                      />
                      <Text style={{ color: tokens.textSecondary, marginTop: 4, fontSize: 12 }}>
                        {resolutionUploaded
                          ? 'Fotoğraf yüklendi — durumu kaydedebilirsiniz'
                          : 'Fotoğraf seçildi — henüz yüklenmedi'}
                      </Text>
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
                    Açıklama *
                  </Text>
                  <AppTextInput
                    value={solutionText}
                    onChangeText={setSolutionText}
                    placeholder="Yapılan tamir / çözüm"
                    placeholderTextColor={tokens.textSecondary}
                    multiline
                    {...iosDoneAccessoryProps}
                    style={{
                      marginTop: 8,
                      minHeight: 100,
                      borderWidth: 1,
                      borderColor: tokens.border,
                      borderRadius: 10,
                      padding: 12,
                      color: tokens.textPrimary,
                      backgroundColor: tokens.bgSurface1,
                      textAlignVertical: 'top',
                    }}
                  />

                  <View style={{ marginTop: 16 }}>
                    <PrimaryButton
                      label={
                        busy
                          ? 'Kaydediliyor…'
                          : resolutionUploaded
                            ? 'Tamamlandı olarak kaydet'
                            : 'Fotoğrafı yükle ve Tamamlandı yap'
                      }
                      onPress={() => void completeDone()}
                      disabled={
                        busy ||
                        (!resolutionPhoto && !resolutionUploaded) ||
                        !solutionText.trim()
                      }
                    />
                  </View>
                  {resolutionPhoto && !resolutionUploaded ? (
                    <View style={{ marginTop: 8 }}>
                      <OutlineButton
                        label="Fotoğrafı Tekrar Dene"
                        onPress={() => void uploadResolutionPhoto(issue.ID)}
                      />
                    </View>
                  ) : null}
                  <Pressable
                    onPress={() => setShowDoneForm(false)}
                    style={{ marginTop: 12, minHeight: 44, justifyContent: 'center' }}
                  >
                    <Text style={{ color: tokens.textSecondary, textAlign: 'center' }}>
                      İptal
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {canApprove || canConditional ? (
                <View style={{ marginTop: space[5], gap: 8 }}>
                  {canApprove ? (
                    <PrimaryButton
                      label={busy ? 'Güncelleniyor…' : 'Kalite Onay'}
                      onPress={() => void applyStatus('APPROVED')}
                      disabled={busy}
                    />
                  ) : null}
                  {canConditional ? (
                    <OutlineButton
                      label={busy ? 'Güncelleniyor…' : 'Şartlı Onay'}
                      onPress={() => {
                        if (!busy) void applyStatus('CONDITIONAL_APPROVED');
                      }}
                    />
                  ) : null}
                </View>
              ) : null}

              {!has(Perm.IssueTransitionProgress) &&
              !has(Perm.IssueTransitionApprove) &&
              !has(Perm.IssueTransitionConditionalApprove) ? (
                <View style={{ marginTop: space[5] }}>
                  <Subtitle>Bu issue için yetkili bir işlem yok</Subtitle>
                </View>
              ) : issue.Status === 'DONE' && !canApprove && !canConditional ? (
                <View style={{ marginTop: space[5] }}>
                  <Subtitle>Kalite Onay / Şartlı Onay bekleniyor</Subtitle>
                </View>
              ) : !next && !canMarkDone && !canApprove && !canConditional ? (
                <View style={{ marginTop: space[5] }}>
                  <Subtitle>Bu issue için başka geçiş yok</Subtitle>
                </View>
              ) : null}
            </Card>

            <Card style={{ marginTop: 0 }}>
              <SectionHeading>{issueDetailCopy.history}</SectionHeading>
              {history.length === 0 ? (
                <Subtitle>Henüz durum değişikliği yok</Subtitle>
              ) : (
                history.map((row) => (
                  <View key={row.ID} style={{ marginTop: space[2] }}>
                    <Text style={{ color: tokens.textPrimary, fontWeight: '600', fontSize: 14 }}>
                      {issueStatusLabel(row.FromStatus || '')} → {issueStatusLabel(row.ToStatus || '')}:{' '}
                      {row.ActorName || '—'}, {formatDate(row.EventAt)}
                    </Text>
                  </View>
                ))
              )}
            </Card>

            <Card style={{ marginTop: 0 }}>
              <SectionHeading>{issueDetailCopy.photos}</SectionHeading>
              <Text
                style={{
                  color: tokens.textSecondary,
                  fontSize: 13,
                  fontWeight: '500',
                  marginTop: space[3],
                }}
              >
                {issueDetailCopy.reportPhotos}
              </Text>
              {reportPhotos.length === 0 ? (
                <Subtitle>{issueDetailCopy.photosEmpty}</Subtitle>
              ) : (
                reportPhotos.map((p) => {
                  const uri = mediaFileUrl(p.storage_path);
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setViewerUri(uri)}
                      style={{ marginTop: space[3] }}
                      accessibilityRole="imagebutton"
                      accessibilityLabel={`Büyüt: ${p.file_name}`}
                    >
                      <Image
                        source={{ uri }}
                        style={{
                          width: '100%',
                          height: 200,
                          borderRadius: 10,
                          backgroundColor: tokens.bgSurface2,
                        }}
                        resizeMode="cover"
                      />
                      <Text style={{ color: tokens.textSecondary, marginTop: 4, fontSize: 12 }}>
                        {p.file_name}
                      </Text>
                    </Pressable>
                  );
                })
              )}
              <Text
                style={{
                  color: tokens.textSecondary,
                  fontSize: 13,
                  fontWeight: '500',
                  marginTop: space[5],
                }}
              >
                {issueDetailCopy.resolutionPhotos}
              </Text>
              {resolutionPhotos.length === 0 ? (
                <Subtitle>{issueDetailCopy.photosEmpty}</Subtitle>
              ) : (
                resolutionPhotos.map((p) => {
                  const uri = mediaFileUrl(p.storage_path);
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setViewerUri(uri)}
                      style={{ marginTop: space[3] }}
                      accessibilityRole="imagebutton"
                      accessibilityLabel={`Büyüt: ${p.file_name}`}
                    >
                      <Image
                        source={{ uri }}
                        style={{
                          width: '100%',
                          height: 200,
                          borderRadius: 10,
                          backgroundColor: tokens.bgSurface2,
                        }}
                        resizeMode="cover"
                      />
                      <Text style={{ color: tokens.textSecondary, marginTop: 4, fontSize: 12 }}>
                        {p.file_name}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </Card>
          </View>
        ) : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
      </DismissKeyboardScrollView>

      <Modal
        visible={!!viewerUri}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerUri(null)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.92)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={() => setViewerUri(null)}
        >
          <Pressable
            onPress={() => setViewerUri(null)}
            style={{
              position: 'absolute',
              top: insets.top + 12,
              right: 20 + insets.right,
              zIndex: 2,
              minHeight: 44,
            }}
            accessibilityRole="button"
            accessibilityLabel="Fotoğrafı kapat"
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Kapat</Text>
          </Pressable>
          {viewerUri ? (
            <Image
              source={{ uri: viewerUri }}
              style={{ width: '100%', height: '80%' }}
              resizeMode="contain"
            />
          ) : null}
        </Pressable>
      </Modal>
    </Screen>
  );
}
