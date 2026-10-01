import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { RefreshCw } from 'lucide-react-native';
import {
  type DefectPart,
  type DefectType,
  type DefectZone,
  type Issue,
} from '../api/client';
import { AppTextInput, InfoText, Subtitle } from './ui';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n';
import { useReferenceCache } from '../offline/ReferenceCacheProvider';
import { CacheAgeHint } from '../offline/CacheAgeHint';
import type { Locale, Translate } from '../../../shared/i18n';
import {
  OTHER_PART_CODE,
  OTHER_TYPE_CODE,
  isOtherPartCode,
  isOtherTypeCode,
  validateDefectClassification,
} from '../../../shared/issueDefectValidation';

export { OTHER_PART_CODE, OTHER_TYPE_CODE };

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
  /** Saved values of an existing issue, offered even if since deactivated. */
  saved?: SavedClassification;
}

export interface SavedClassification {
  zone?: DefectZone;
  part?: DefectPart;
  type?: DefectType;
}

/**
 * Rebuilds the issue's saved zone/part/type from its snapshot fields so the
 * editor can keep them after deactivation (the backend validates only
 * changed fields). Entries still in the active catalogue are ignored.
 */
export function savedClassificationFromIssue(issue: Issue): SavedClassification {
  // DefectCode is "<part code>-<type code>", e.g. 10-03-05.
  const code = issue.DefectCode ?? '';
  const cut = code.lastIndexOf('-');
  const out: SavedClassification = {};
  if (issue.DefectZoneID != null) {
    out.zone = {
      ID: issue.DefectZoneID,
      Code: '',
      NameTR: issue.DefectZoneNameTR ?? '',
      NameEN: issue.DefectZoneNameEN ?? '',
      IsActive: false,
    };
    if (issue.DefectPartID != null) {
      out.part = {
        ID: issue.DefectPartID,
        ZoneID: issue.DefectZoneID,
        Code: cut > 0 ? code.slice(0, cut) : '',
        NameTR: issue.DefectPartNameTR ?? '',
        NameEN: issue.DefectPartNameEN ?? '',
        IsActive: false,
        ZoneNameTR: issue.DefectZoneNameTR,
        ZoneNameEN: issue.DefectZoneNameEN,
      };
    }
  }
  if (issue.DefectTypeID != null) {
    out.type = {
      ID: issue.DefectTypeID,
      Code: cut > 0 ? code.slice(cut + 1) : '',
      NameTR: issue.DefectTypeNameTR ?? '',
      NameEN: issue.DefectTypeNameEN ?? '',
      IsActive: false,
    };
  }
  return out;
}

function codePrefix(code: string): string {
  return code ? `${code} · ` : '';
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
  return zone ? `${codePrefix(part.Code)}${name} (${zone})` : `${codePrefix(part.Code)}${name}`;
}

export function isDefectClassificationComplete(
  state: DefectClassificationState,
  parts: DefectPart[],
  types: DefectType[],
): boolean {
  return validateDefectClassification(state, parts, types) == null;
}

export function defectClassificationValidationMessage(
  state: DefectClassificationState,
  parts: DefectPart[],
  types: DefectType[],
  t?: Translate,
): string | null {
  const key = validateDefectClassification(state, parts, types);
  if (!key) return null;
  return t ? t(key) : key;
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
  saved,
}: DefectClassificationFieldsProps) {
  const { tokens } = useTheme();
  const { t } = useI18n();
  const { snapshot, ready, catalogAgeLabel, refreshing, refresh } = useReferenceCache();

  // An older cache may still hold parts of a zone deactivated since; a part
  // is offered only while its zone is in the active zone list.
  const activeZoneIds = useMemo(
    () => new Set(snapshot.zones.map((z) => z.ID)),
    [snapshot.zones],
  );
  const activeParts = useMemo(
    () =>
      snapshot.parts.filter(
        (p) => activeZoneIds.has(p.ZoneID) && p.ZoneIsActive !== false,
      ),
    [snapshot.parts, activeZoneIds],
  );

  const keptZone =
    saved?.zone && !snapshot.zones.some((z) => z.ID === saved.zone?.ID) ? saved.zone : null;
  const keptPart =
    saved?.part && !activeParts.some((p) => p.ID === saved.part?.ID) ? saved.part : null;
  const keptType =
    saved?.type && !snapshot.types.some((ty) => ty.ID === saved.type?.ID) ? saved.type : null;

  const zones = useMemo(
    () => (keptZone ? [...snapshot.zones, keptZone] : snapshot.zones),
    [snapshot.zones, keptZone],
  );
  const allParts = useMemo(
    () => (keptPart ? [...activeParts, keptPart] : activeParts),
    [activeParts, keptPart],
  );
  const types = useMemo(
    () => (keptType ? [...snapshot.types, keptType] : snapshot.types),
    [snapshot.types, keptType],
  );
  const inactiveSuffix = t('catalog.inactiveSuffix');
  const loading = !ready && zones.length === 0;
  const emptyCache = ready && zones.length === 0 && allParts.length === 0;

  const [zonePickerOpen, setZonePickerOpen] = useState(false);
  const [partPickerOpen, setPartPickerOpen] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [partSearch, setPartSearch] = useState('');

  const onCatalogLoadedRef = useRef(onCatalogLoaded);
  onCatalogLoadedRef.current = onCatalogLoaded;

  useEffect(() => {
    onCatalogLoadedRef.current?.(allParts, types);
  }, [allParts, types]);

  const keepingInactive =
    (keptZone != null && zoneId === keptZone.ID) ||
    (keptPart != null && partId === keptPart.ID) ||
    (keptType != null && typeId === keptType.ID);

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
    return activeParts.filter((p) => {
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
  }, [activeParts, partSearch]);

  const showCustomPart = isOtherPartCode(selectedPart?.Code);
  const showCustomDefect = isOtherTypeCode(selectedType?.Code);

  function pickPart(part: DefectPart) {
    onChange({
      partId: part.ID,
      zoneId: part.ZoneID,
      customPartName: isOtherPartCode(part.Code) ? customPartName : '',
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
      customPartName: isOtherPartCode(nextPart?.Code) ? customPartName : '',
    });
    setZonePickerOpen(false);
  }

  return (
    <View>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}
      >
        <Text style={{ flex: 1, color: tokens.textSecondary, fontSize: 12 }}>
          {catalogAgeLabel ?? ''}
        </Text>
        <Pressable
          testID="catalog-refresh"
          accessibilityRole="button"
          accessibilityLabel={t('catalog.refresh')}
          onPress={() => void refresh(true)}
          disabled={refreshing}
          style={{
            minHeight: 44,
            paddingHorizontal: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: tokens.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            opacity: refreshing ? 0.6 : 1,
          }}
        >
          <RefreshCw size={16} color={tokens.accent} />
          <Text style={{ color: tokens.accent, fontSize: 13, fontWeight: '600' }}>
            {refreshing ? t('catalog.refreshing') : t('catalog.refresh')}
          </Text>
        </Pressable>
      </View>

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
            ? `${codePrefix(selectedZone.Code)}${localizedName(selectedZone, locale)}${
                selectedZone.ID === keptZone?.ID ? inactiveSuffix : ''
              }`
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
            ? `${codePrefix(selectedPart.Code)}${localizedName(selectedPart, locale)}${
                selectedPart.ID === keptPart?.ID ? inactiveSuffix : ''
              }`
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
            ? `${codePrefix(selectedType.Code)}${localizedName(selectedType, locale)}${
                selectedType.ID === keptType?.ID ? inactiveSuffix : ''
              }`
            : t('report.defectType')}
        </Text>
      </Pressable>

      {keepingInactive ? <InfoText>{t('catalog.keptInactiveHint')}</InfoText> : null}

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
      {emptyCache ? <InfoText>{t('offline.noCache')}</InfoText> : null}
      <CacheAgeHint />

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
                    {codePrefix(z.Code)}
                    {localizedName(z, locale)}
                    {z.ID === keptZone?.ID ? inactiveSuffix : ''}
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
                    {codePrefix(p.Code)}
                    {localizedName(p, locale)}
                    {p.ID === keptPart?.ID ? inactiveSuffix : ''}
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
                        isOtherTypeCode(dt.Code) ? customDefectName : '',
                    });
                    setTypePickerOpen(false);
                  }}
                  style={sheetRowStyle(tokens)}
                >
                  <Text style={{ color: tokens.textPrimary, fontSize: 15 }}>
                    {codePrefix(dt.Code)}
                    {localizedName(dt, locale)}
                    {dt.ID === keptType?.ID ? inactiveSuffix : ''}
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
