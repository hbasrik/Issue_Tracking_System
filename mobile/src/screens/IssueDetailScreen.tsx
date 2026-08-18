import { useCallback, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import {
  ApiError,
  api,
  mediaFileUrl,
  type Issue,
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
  return null;
}

function statusColor(status: Issue['Status']): string {
  if (status === 'OPEN') return statusColors.issueOpen;
  if (status === 'IN_PROGRESS') return statusColors.issueInProgress;
  return statusColors.issueResolved;
}

function formatDate(iso?: string): string {
  if (!iso || iso.startsWith('0001')) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function IssueDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'IssueDetail'>>();
  const { tokens } = useTheme();
  const [issue, setIssue] = useState<Issue | null>(null);
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
      const [i, report, resolution] = await Promise.all([
        api.getIssue(id),
        api.listMedia('ISSUE', String(id)),
        api.listMedia('ISSUE_RESOLUTION', String(id)),
      ]);
      setIssue(i);
      setReportPhotos(report.items ?? []);
      setResolutionPhotos(resolution.items ?? []);
      if ((resolution.items ?? []).length > 0) {
        setResolutionUploaded(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issue');
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
        quality: 0.6,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (asset) {
        setResolutionPhoto({
          uri: asset.uri,
          name: asset.fileName || `resolution-${Date.now()}.jpg`,
          type: asset.mimeType || 'image/jpeg',
        });
        setResolutionUploaded(false);
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
      quality: 0.6,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) {
      setResolutionPhoto({
        uri: asset.uri,
        name: asset.fileName || `resolution-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
      setResolutionUploaded(false);
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
          err instanceof Error ? err.message : 'upload failed'
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

  const next = issue ? nextOperatorStatus(issue.Status) : null;
  const canMarkDone = issue?.Status === 'IN_PROGRESS';

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <Title>Issue #{route.params.id}</Title>
        {issue ? (
          <>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Badge label={issue.Status} color={statusColor(issue.Status)} />
                <SeverityIndicator severity={issue.Severity} size="md" />
              </View>
              <Text style={{ color: tokens.textSecondary, marginTop: 12, fontSize: 12 }}>
                Bildiren
              </Text>
              <Text style={{ color: tokens.textPrimary, fontSize: 15, fontWeight: '600' }}>
                {issue.ReporterName || `User #${issue.IssueReporterID}`}
              </Text>
              <Text style={{ color: tokens.textSecondary, marginTop: 8, fontSize: 12 }}>
                Bildirim tarihi
              </Text>
              <Text style={{ color: tokens.textPrimary, fontSize: 14 }}>
                {formatDate(issue.IssueDate || issue.CreatedAt)}
              </Text>
              <Text style={{ color: tokens.textSecondary, marginTop: 8, fontSize: 12 }}>
                VIN
              </Text>
              <Text
                style={{
                  color: tokens.textPrimary,
                  fontSize: 15,
                  fontWeight: '600',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {issue.VIN}
              </Text>
            </Card>

            <Text
              style={{
                color: tokens.textPrimary,
                fontWeight: '700',
                fontSize: 16,
                marginTop: 20,
              }}
            >
              Bildirim
            </Text>
            <Card>
              <Text style={{ color: tokens.textPrimary, fontSize: 15 }}>
                {issue.Description}
              </Text>
              {reportPhotos.length === 0 ? (
                <Subtitle>Rapor fotoğrafı yok</Subtitle>
              ) : (
                reportPhotos.map((p) => {
                  const uri = mediaFileUrl(p.storage_path);
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setViewerUri(uri)}
                      style={{ marginTop: 12 }}
                      accessibilityRole="imagebutton"
                      accessibilityLabel={`Enlarge ${p.file_name}`}
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

            {(issue.Status === 'DONE' ||
              issue.Status === 'APPROVED' ||
              issue.Status === 'CONDITIONAL_APPROVED' ||
              resolutionPhotos.length > 0 ||
              !!issue.SolutionDescription) && (
              <>
                <Text
                  style={{
                    color: tokens.textPrimary,
                    fontWeight: '700',
                    fontSize: 16,
                    marginTop: 20,
                  }}
                >
                  Çözüm
                </Text>
                <Card>
                  <Text style={{ color: tokens.textPrimary, fontSize: 15 }}>
                    {issue.SolutionDescription?.trim()
                      ? issue.SolutionDescription
                      : '—'}
                  </Text>
                  {resolutionPhotos.length === 0 ? (
                    <Subtitle>Çözüm fotoğrafı yok</Subtitle>
                  ) : (
                    resolutionPhotos.map((p) => {
                      const uri = mediaFileUrl(p.storage_path);
                      return (
                        <Pressable
                          key={p.id}
                          onPress={() => setViewerUri(uri)}
                          style={{ marginTop: 12 }}
                          accessibilityRole="imagebutton"
                          accessibilityLabel={`Enlarge ${p.file_name}`}
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
                          <Text
                            style={{ color: tokens.textSecondary, marginTop: 4, fontSize: 12 }}
                          >
                            {p.file_name}
                          </Text>
                        </Pressable>
                      );
                    })
                  )}
                </Card>
              </>
            )}

            {next === 'IN_PROGRESS' ? (
              <View style={{ marginTop: 20 }}>
                <PrimaryButton
                  label={busy ? 'Updating…' : 'Mark In Progress'}
                  onPress={() => void advanceToInProgress()}
                  disabled={busy}
                />
              </View>
            ) : null}

            {canMarkDone && !showDoneForm ? (
              <View style={{ marginTop: 20 }}>
                <PrimaryButton
                  label="Mark Done"
                  onPress={() => {
                    setShowDoneForm(true);
                    setError(null);
                  }}
                  disabled={busy}
                />
              </View>
            ) : null}

            {canMarkDone && showDoneForm ? (
              <View style={{ marginTop: 20 }}>
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
                  Önce çözüm fotoğrafını yükleyin, sonra durumu DONE yapın
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
                <TextInput
                  value={solutionText}
                  onChangeText={setSolutionText}
                  placeholder="Yapılan tamir / çözüm"
                  placeholderTextColor={tokens.textSecondary}
                  multiline
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
                          ? 'DONE olarak kaydet'
                          : 'Fotoğrafı yükle ve DONE yap'
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

            {!next && !canMarkDone ? (
              <Subtitle>
                {issue.Status === 'DONE'
                  ? 'Awaiting Manager/Admin approval (not available here)'
                  : 'No further operator transitions'}
              </Subtitle>
            ) : null}
          </>
        ) : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
      </ScrollView>

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
            style={{ position: 'absolute', top: 48, right: 20, zIndex: 2, minHeight: 44 }}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
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
