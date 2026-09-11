import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  api,
  type DefectPart,
  type DefectType,
  type DefectZone,
} from '../api/client';
import { AppTextInput, Subtitle } from './ui';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n';
import { apiErrorMessage } from '../lib/password';
import type { Locale, Translate } from '../../../shared/i18n';

export const OTHER_PART_CODE = '99-99';
export const OTHER_TYPE_CODE = '99';

export interface DefectClassificationState {
  zoneId: number | null;
  partId: number | null;
  typeId: number | null;
  customPartName: string;
  customDefectName: string;
}

export type DefectClassificationChange = (
  patch: Partial<DefectClassificationState>,
) => void;

interface DefectClassificationFieldsProps {
  zoneId: number | null;
  partId: number | null;
  typeId: number | null;
  customPartName: string;
  customDefectName: string;
  onChange: DefectClassificationChange;
  locale: Locale;
  /** Called once after zones/parts/types are loaded (for parent validation). */
  onCatalogLoaded?: (parts: DefectPart[], types: DefectType[]) => void;
}

function localizedName(
  item: { NameTR: string; NameEN: string },
  locale: Locale,
): string {
  return locale === 'tr' ? item.NameTR : item.NameEN;
}

function partLabel(part: DefectPart, locale: Locale): string {
  const zone = localizedName(
    { NameTR: part.ZoneNameTR ?? '', NameEN: part.ZoneNameEN ?? '' },
    locale,
  );
  const name = localizedName(part, locale);
  return zone ? `${part.Code} · ${name} (${zone})` : `${part.Code} · ${name}`;
}

export function isDefectClassificationComplete(
  state: DefectClassificationState,
  parts: DefectPart[],
  types: DefectType[],
): boolean {
  return defectClassificationValidationMessage(state, parts, types) == null;
}

export function defectClassificationValidationMessage(
  state: DefectClassificationState,
  parts: DefectPart[],
  types: DefectType[],
  t?: Translate,
): string | null {
  if (state.zoneId == null) {
    return t?.('report.zoneRequired') ?? 'zone required';
  }
  if (state.partId == null) {
    return t?.('report.partRequired') ?? 'part required';
  }
  if (state.typeId == null) {
    return t?.('report.defectTypeRequired') ?? 'defect type required';
  }
  const part = parts.find((p) => p.ID === state.partId);
  const type = types.find((dt) => dt.ID === state.typeId);
  if (part?.Code === OTHER_PART_CODE && !state.customPartName.trim()) {
    return t?.('report.customPartRequired') ?? 'custom part required';
  }
  if (type?.Code === OTHER_TYPE_CODE && !state.customDefectName.trim()) {
    return t?.('report.customDefectRequired') ?? 'custom defect required';
  }
  return null;
}

export function DefectClassificationFields({
  zoneId,
  partId,
  typeId,
  customPartName,
  customDefectName,
  onChange,
  locale,
  onCatalogLoaded,
}: DefectClassificationFieldsProps) {
  const { tokens } = useTheme();
  const { t } = useI18n();

  const [zones, setZones] = useState<DefectZone[]>([]);
  const [allParts, setAllParts] = useState<DefectPart[]>([]);
  const [types, setTypes] = useState<DefectType[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [zonePickerOpen, setZonePickerOpen] = useState(false);
  const [partPickerOpen, setPartPickerOpen] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [partSearch, setPartSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [zonesRes, partsRes, typesRes] = await Promise.all([
          api.listDefectCatalogZones(),
          api.listDefectCatalogParts(),
          api.listDefectCatalogTypes(),
        ]);
        if (cancelled) return;
        const parts = partsRes.items ?? [];
        const loadedTypes = typesRes.items ?? [];
        setZones(zonesRes.items ?? []);
        setAllParts(parts);
        setTypes(loadedTypes);
        onCatalogLoaded?.(parts, loadedTypes);
      } catch (err) {
        if (!cancelled) {
          setLoadError(apiErrorMessage(err, t));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const selectedZone = zones.find((z) => z.ID === zoneId) ?? null;
  const selectedPart = allParts.find((p) => p.ID === partId) ?? null;
  const selectedType = types.find((dt) => dt.ID === typeId) ?? null;

  const zoneParts = useMemo(() => {
    if (zoneId == null) return [];
    return allParts.filter((p) => p.ZoneID === zoneId);
  }, [allParts, zoneId]);

  const searchResults = useMemo(() => {
    const q = partSearch.trim().toLowerCase();
    if (q.length < 1) return [];
    return allParts.filter((p) => {
      const haystack = [
        p.Code,
        p.NameTR,
        p.NameEN,
        p.ZoneNameTR ?? '',
        p.ZoneNameEN ?? '',
        p.ZoneCode ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [allParts, partSearch]);

  const showCustomPart = selectedPart?.Code === OTHER_PART_CODE;
  const showCustomDefect = selectedType?.Code === OTHER_TYPE_CODE;

  function pickPart(part: DefectPart) {
    onChange({
      partId: part.ID,
      zoneId: part.ZoneID,
      customPartName: part.Code === OTHER_PART_CODE ? customPartName : '',
    });
    setPartSearch('');
    setPartPickerOpen(false);
  }

  function pickZone(id: number) {
    const nextPart =
      partId != null
        ? allParts.find((p) => p.ID === partId && p.ZoneID === id)
        : null;
    onChange({
      zoneId: id,
      partId: nextPart?.ID ?? null,
      customPartName: nextPart?.Code === OTHER_PART_CODE ? customPartName : '',
    });
    setZonePickerOpen(false);
  }

  return (
    <View>
      <Text style={labelStyle(tokens)}>{t('report.zone')} *</Text>
      <Pressable
        onPress={() => setZonePickerOpen(true)}
        disabled={loading}
        style={pickerStyle(tokens)}
      >
        <Text
          style={{
            color: selectedZone ? tokens.textPrimary : tokens.textSecondary,
          }}
        >
          {selectedZone
            ? `${selectedZone.Code} · ${localizedName(selectedZone, locale)}`
            : t('report.zone')}
        </Text>
      </Pressable>

      <Text style={labelStyle(tokens)}>{t('report.partSearch')}</Text>
      <AppTextInput
        value={partSearch}
        onChangeText={setPartSearch}
        placeholder={t('report.partSearch')}
        placeholderTextColor={tokens.textSecondary}
        style={{
          marginTop: 8,
          minHeight: 44,
          borderWidth: 1,
          borderRadius: 10,
          paddingHorizontal: 12,
          color: tokens.textPrimary,
          borderColor: tokens.border,
          backgroundColor: tokens.bgSurface1,
          fontSize: 15,
        }}
      />
      {searchResults.length > 0 ? (
        <View
          style={{
            marginTop: 4,
            borderWidth: 1,
            borderColor: tokens.border,
            borderRadius: 10,
            backgroundColor: tokens.bgSurface1,
            maxHeight: 200,
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            {searchResults.map((p) => (
              <Pressable
                key={p.ID}
                onPress={() => pickPart(p)}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 12,
                  justifyContent: 'center',
                  borderBottomWidth: 1,
                  borderBottomColor: tokens.border,
                }}
              >
                <Text style={{ color: tokens.textPrimary, fontSize: 14 }}>
                  {partLabel(p, locale)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <Text style={labelStyle(tokens)}>{t('report.part')} *</Text>
      <Pressable
        onPress={() => setPartPickerOpen(true)}
        disabled={loading || zoneId == null}
        style={[
          pickerStyle(tokens),
          zoneId == null ? { opacity: 0.5 } : null,
        ]}
      >
        <Text
          style={{
            color: selectedPart ? tokens.textPrimary : tokens.textSecondary,
          }}
        >
          {selectedPart
            ? `${selectedPart.Code} · ${localizedName(selectedPart, locale)}`
            : t('report.part')}
        </Text>
      </Pressable>

      <Text style={labelStyle(tokens)}>{t('report.defectType')} *</Text>
      <Pressable
        onPress={() => setTypePickerOpen(true)}
        disabled={loading}
        style={pickerStyle(tokens)}
      >
        <Text
          style={{
            color: selectedType ? tokens.textPrimary : tokens.textSecondary,
          }}
        >
          {selectedType
            ? `${selectedType.Code} · ${localizedName(selectedType, locale)}`
            : t('report.defectType')}
        </Text>
      </Pressable>

      {showCustomPart ? (
        <>
          <Text style={labelStyle(tokens)}>{t('report.customPartName')} *</Text>
          <AppTextInput
            value={customPartName}
            onChangeText={(text) => onChange({ customPartName: text })}
            placeholder={t('report.customPartName')}
            placeholderTextColor={tokens.textSecondary}
            style={{
              marginTop: 8,
              minHeight: 44,
              borderWidth: 1,
              borderRadius: 10,
              paddingHorizontal: 12,
              color: tokens.textPrimary,
              borderColor: tokens.border,
              backgroundColor: tokens.bgSurface1,
              fontSize: 15,
            }}
          />
        </>
      ) : null}

      {showCustomDefect ? (
        <>
          <Text style={labelStyle(tokens)}>
            {t('report.customDefectName')} *
          </Text>
          <AppTextInput
            value={customDefectName}
            onChangeText={(text) => onChange({ customDefectName: text })}
            placeholder={t('report.customDefectName')}
            placeholderTextColor={tokens.textSecondary}
            style={{
              marginTop: 8,
              minHeight: 44,
              borderWidth: 1,
              borderRadius: 10,
              paddingHorizontal: 12,
              color: tokens.textPrimary,
              borderColor: tokens.border,
              backgroundColor: tokens.bgSurface1,
              fontSize: 15,
            }}
          />
        </>
      ) : null}

      {loading ? <Subtitle>{t('report.typesLoading')}</Subtitle> : null}
      {loadError ? (
        <Text style={{ color: tokens.textSecondary, marginTop: 8, fontSize: 13 }}>
          {loadError}
        </Text>
      ) : null}

      <Modal visible={zonePickerOpen} animationType="slide" transparent>
        <Pressable
          style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}
          onPress={() => setZonePickerOpen(false)}
        >
          <View style={sheetStyle(tokens)}>
            <Text style={sheetTitleStyle(tokens)}>{t('report.zone')}</Text>
            <ScrollView>
              {zones.map((z) => (
                <Pressable
                  key={z.ID}
                  onPress={() => pickZone(z.ID)}
                  style={sheetRowStyle(tokens)}
                >
                  <Text style={{ color: tokens.textPrimary, fontSize: 15 }}>
                    {z.Code} · {localizedName(z, locale)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={partPickerOpen} animationType="slide" transparent>
        <Pressable
          style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}
          onPress={() => setPartPickerOpen(false)}
        >
          <View style={sheetStyle(tokens)}>
            <Text style={sheetTitleStyle(tokens)}>{t('report.part')}</Text>
            <ScrollView>
              {zoneParts.map((p) => (
                <Pressable
                  key={p.ID}
                  onPress={() => pickPart(p)}
                  style={sheetRowStyle(tokens)}
                >
                  <Text style={{ color: tokens.textPrimary, fontSize: 15 }}>
                    {p.Code} · {localizedName(p, locale)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={typePickerOpen} animationType="slide" transparent>
        <Pressable
          style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}
          onPress={() => setTypePickerOpen(false)}
        >
          <View style={sheetStyle(tokens)}>
            <Text style={sheetTitleStyle(tokens)}>{t('report.defectType')}</Text>
            <ScrollView>
              {types.map((dt) => (
                <Pressable
                  key={dt.ID}
                  onPress={() => {
                    onChange({
                      typeId: dt.ID,
                      customDefectName:
                        dt.Code === OTHER_TYPE_CODE ? customDefectName : '',
                    });
                    setTypePickerOpen(false);
                  }}
                  style={sheetRowStyle(tokens)}
                >
                  <Text style={{ color: tokens.textPrimary, fontSize: 15 }}>
                    {dt.Code} · {localizedName(dt, locale)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function labelStyle(tokens: { textSecondary: string }) {
  return {
    color: tokens.textSecondary,
    marginTop: 16,
    fontSize: 13,
  } as const;
}

function pickerStyle(tokens: {
  border: string;
  bgSurface1: string;
  textSecondary: string;
}) {
  return {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tokens.border,
    backgroundColor: tokens.bgSurface1,
    paddingHorizontal: 12,
    justifyContent: 'center' as const,
  };
}

function sheetStyle(tokens: { bgSurface1: string }) {
  return {
    maxHeight: '70%' as const,
    backgroundColor: tokens.bgSurface1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  };
}

function sheetTitleStyle(tokens: { textPrimary: string }) {
  return {
    color: tokens.textPrimary,
    fontWeight: '600' as const,
    fontSize: 17,
    marginBottom: 12,
  };
}

function sheetRowStyle(tokens: { border: string }) {
  return {
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: tokens.border,
    justifyContent: 'center' as const,
  };
}
