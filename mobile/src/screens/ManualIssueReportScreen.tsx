import { useCallback, useEffect, useState } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ApiError,
  api,
  type IssueType,
  type LocalFile,
  type Station,
  type Vehicle,
} from '../api/client';
import { VinSearchBox } from '../components/VinSearchBox';
import {
  DismissKeyboardScrollView,
  iosDoneAccessoryProps,
} from '../components/keyboard';
import { prepareUploadImage } from '../lib/prepareUploadImage';
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
  type SeverityLevel,
} from '../components/SeverityIndicator';
import { useTheme } from '../theme/ThemeProvider';
import type { RootStackParamList } from '../navigation/types';

const SEVERITIES: { value: SeverityLevel; label: string }[] = [
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

/**
 * Standalone Issue Bildir — MANUAL source, not tied to a station step or
 * checklist item. Every field (including photo) is required before submit.
 */
export default function ManualIssueReportScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { tokens } = useTheme();

  const [issueTypes, setIssueTypes] = useState<IssueType[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [issueTypeId, setIssueTypeId] = useState<number | null>(null);
  const [severity, setSeverity] = useState<SeverityLevel | null>(null);
  const [stationId, setStationId] = useState<number | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [vinPickerOpen, setVinPickerOpen] = useState(false);
  const [stationPickerOpen, setStationPickerOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<LocalFile | null>(null);
  const [createdIssueId, setCreatedIssueId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [typesRes, stationsRes] = await Promise.all([
          api.listIssueTypes(),
          api.listStations(),
        ]);
        if (cancelled) return;
        setIssueTypes(typesRes.items ?? []);
        setStations(
          (stationsRes.items ?? [])
            .slice()
            .sort((a, b) => a.SequenceNo - b.SequenceNo),
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Form yüklenemedi');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedStation = stations.find((s) => s.ID === stationId) ?? null;
  const selectedType = issueTypes.find((t) => t.ID === issueTypeId) ?? null;

  const canSubmit =
    issueTypeId != null &&
    severity != null &&
    stationId != null &&
    vehicle != null &&
    description.trim().length > 0 &&
    photo != null &&
    !busy;

  const validationMessage = useCallback((): string | null => {
    if (issueTypeId == null) return 'Tür seçimi zorunlu (Hata / Tamir Gerekiyor)';
    if (severity == null) return 'Severity seçimi zorunlu';
    if (stationId == null) return 'İstasyon seçimi zorunlu';
    if (vehicle == null) return 'VIN seçimi zorunlu — listeden bir araç seçin';
    if (!description.trim()) return 'Açıklama zorunlu';
    if (photo == null) return 'Fotoğraf zorunlu — kamera veya galeriden ekleyin';
    return null;
  }, [issueTypeId, severity, stationId, vehicle, description, photo]);

  async function pickFromLibrary() {
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
        setPhoto(await prepareUploadImage(asset));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Fotoğraf dönüştürülemedi',
        );
      }
    }
  }

  async function pickFromCamera() {
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
        setPhoto(await prepareUploadImage(asset));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Fotoğraf dönüştürülemedi',
        );
      }
    }
  }

  async function uploadPhoto(issueId: number): Promise<boolean> {
    if (!photo) {
      setError(`Issue #${issueId} kaydedildi, fotoğraf eksik`);
      return false;
    }
    try {
      await api.uploadMedia('ISSUE', String(issueId), photo);
      return true;
    } catch (err) {
      setError(
        `Issue #${issueId} kaydedildi, fotoğraf yüklenemedi: ${
          err instanceof Error ? err.message : 'upload failed'
        }`,
      );
      return false;
    }
  }

  async function submit() {
    setError(null);
    const msg = validationMessage();
    if (msg) {
      setError(msg);
      return;
    }
    if (!vehicle || !severity || stationId == null || issueTypeId == null || !photo) {
      return;
    }

    setBusy(true);
    try {
      let issueId = createdIssueId;
      if (issueId == null) {
        const issue = await api.createIssue({
          vin: vehicle.VIN,
          source_type: 'MANUAL',
          station_id: stationId,
          issue_type_id: issueTypeId,
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
      setError(err instanceof ApiError ? err.message : 'Issue oluşturulamadı');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded={false}>
      <DismissKeyboardScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <Title>Issue Bildir</Title>
        <Subtitle>Bağımsız bildirim — istasyon adımı veya checklist’e bağlı değil</Subtitle>

        <Text style={labelStyle(tokens)}>Tür *</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {issueTypes.map((t) => {
            const selected = issueTypeId === t.ID;
            return (
              <Pressable
                key={t.ID}
                onPress={() => setIssueTypeId(t.ID)}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: selected ? tokens.accent : tokens.border,
                  backgroundColor: selected
                    ? tokens.accent + '22'
                    : tokens.bgSurface1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 8,
                }}
              >
                <Text
                  style={{
                    color: selected ? tokens.accent : tokens.textSecondary,
                    fontWeight: '600',
                    fontSize: 14,
                    textAlign: 'center',
                  }}
                >
                  {t.Name}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {issueTypes.length === 0 ? (
          <Subtitle>Türler yükleniyor…</Subtitle>
        ) : null}

        <Text style={labelStyle(tokens)}>Severity *</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {SEVERITIES.map((s) => {
            const selected = severity === s.value;
            const color = severityFillColor(s.value);
            return (
              <Pressable
                key={s.value}
                onPress={() => setSeverity(s.value)}
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
                <SeverityIndicator severity={s.value} />
                <Text
                  style={{
                    color: selected ? color : tokens.textSecondary,
                    fontWeight: '600',
                    fontSize: 11,
                  }}
                >
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={labelStyle(tokens)}>İstasyon *</Text>
        <Pressable
          onPress={() => setStationPickerOpen(true)}
          style={{
            marginTop: 8,
            minHeight: 44,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: tokens.border,
            backgroundColor: tokens.bgSurface1,
            paddingHorizontal: 12,
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: selectedStation ? tokens.textPrimary : tokens.textSecondary }}>
            {selectedStation
              ? `${selectedStation.SequenceNo}. ${selectedStation.Name}`
              : 'İstasyon seçin'}
          </Text>
        </Pressable>

        <Text style={labelStyle(tokens)}>VIN *</Text>
        <Pressable
          onPress={() => setVinPickerOpen(true)}
          style={{
            marginTop: 8,
            minHeight: 44,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: tokens.border,
            backgroundColor: tokens.bgSurface1,
            paddingHorizontal: 12,
            justifyContent: 'center',
          }}
        >
          {vehicle ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <Badge label={`…${vehicle.VIN.slice(-5)}`} color={tokens.accent} />
              <Text style={{ color: tokens.textSecondary, fontSize: 13 }}>
                {vehicle.VIN}
              </Text>
            </View>
          ) : (
            <Text style={{ color: tokens.textSecondary }}>Araç ara / seç</Text>
          )}
        </Pressable>

        <Text style={labelStyle(tokens)}>Açıklama *</Text>
        <AppTextInput
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          placeholder="Sorunu açıklayın"
          placeholderTextColor={tokens.textSecondary}
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

        <Text style={labelStyle(tokens)}>Fotoğraf *</Text>
        <View style={{ marginTop: 8, gap: 8 }}>
          <OutlineButton
            label={photo ? `Seçildi: ${photo.name} (galeriden değiştir)` : 'Galeriden fotoğraf seç'}
            onPress={() => void pickFromLibrary()}
          />
          <OutlineButton
            label="Kamerayla çek"
            onPress={() => void pickFromCamera()}
          />
        </View>

        {selectedType || selectedStation || vehicle ? (
          <Card>
            <Text style={{ color: tokens.textSecondary, fontSize: 12 }}>
              Özet: {selectedType?.Name ?? '—'} · {severity ?? '—'} ·{' '}
              {selectedStation?.Name ?? '—'} ·{' '}
              {vehicle ? `…${vehicle.VIN.slice(-5)}` : '—'}
            </Text>
          </Card>
        ) : null}

        {error ? <ErrorText>{error}</ErrorText> : null}

        <View style={{ marginTop: 24 }}>
          <PrimaryButton
            label={
              busy
                ? 'Kaydediliyor…'
                : createdIssueId != null
                  ? 'Fotoğrafı Tekrar Yükle'
                  : 'Issue’ı Kaydet'
            }
            onPress={() => void submit()}
            disabled={
              busy ||
              (createdIssueId == null ? !canSubmit : photo == null)
            }
          />
        </View>
      </DismissKeyboardScrollView>

      <Modal visible={stationPickerOpen} animationType="slide" transparent>
        <Pressable
          style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}
          onPress={() => setStationPickerOpen(false)}
        >
          <View
            style={{
              maxHeight: '70%',
              backgroundColor: tokens.bgSurface1,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 16,
            }}
          >
            <Text style={{ color: tokens.textPrimary, fontWeight: '600', fontSize: 17, marginBottom: 12 }}>
              İstasyon seç
            </Text>
            <ScrollView>
              {stations.map((s) => (
                <Pressable
                  key={s.ID}
                  onPress={() => {
                    setStationId(s.ID);
                    setStationPickerOpen(false);
                  }}
                  style={{
                    minHeight: 48,
                    borderBottomWidth: 1,
                    borderBottomColor: tokens.border,
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: tokens.textPrimary, fontSize: 15 }}>
                    {s.SequenceNo}. {s.Name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={vinPickerOpen} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}>
          <View
            style={{
              height: '80%',
              backgroundColor: tokens.bgPage,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 16,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <Text style={{ color: tokens.textPrimary, fontWeight: '600', fontSize: 17 }}>
                VIN seç
              </Text>
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setVinPickerOpen(false);
                }}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text style={{ color: tokens.accent, fontWeight: '600' }}>Kapat</Text>
              </Pressable>
            </View>
            <DismissKeyboardScrollView>
              <VinSearchBox
                onSelect={(v) => {
                  Keyboard.dismiss();
                  setVehicle(v);
                  setVinPickerOpen(false);
                }}
              />
            </DismissKeyboardScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function labelStyle(tokens: { textSecondary: string }) {
  return {
    color: tokens.textSecondary,
    marginTop: 16,
    fontSize: 13,
  } as const;
}
