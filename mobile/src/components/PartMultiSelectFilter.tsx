import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import type { DefectPart } from '../api/client';
import { useI18n } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { mixColors } from '../theme/tokens';
import { AppTextInput } from './ui';

type PartOption = Pick<DefectPart, 'ID' | 'ZoneID' | 'NameTR' | 'NameEN'>;

interface PartMultiSelectFilterProps {
  parts: PartOption[];
  selectedIds: Set<number>;
  onChange: (next: Set<number>) => void;
  zoneIds: Set<number>;
  disabled?: boolean;
}

function partLabel(p: PartOption, locale: string): string {
  return locale === 'en' ? p.NameEN || p.NameTR : p.NameTR || p.NameEN;
}

/** Multi-select parts filter — sheet picker + removable tags. */
export function PartMultiSelectFilter({
  parts,
  selectedIds,
  onChange,
  zoneIds,
  disabled = false,
}: PartMultiSelectFilterProps) {
  const { t, locale } = useI18n();
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    const scoped =
      zoneIds.size === 0
        ? parts
        : parts.filter((p) => zoneIds.has(p.ZoneID));
    const q = query.trim().toLocaleLowerCase(locale === 'en' ? 'en' : 'tr');
    if (!q) return scoped;
    return scoped.filter((p) =>
      partLabel(p, locale).toLocaleLowerCase().includes(q),
    );
  }, [parts, zoneIds, query, locale]);

  const selectedParts = useMemo(
    () => parts.filter((p) => selectedIds.has(p.ID)),
    [parts, selectedIds],
  );

  function toggle(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function remove(id: number) {
    const next = new Set(selectedIds);
    next.delete(id);
    onChange(next);
  }

  return (
    <View>
      {selectedParts.length > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 8,
          }}
        >
          {selectedParts.map((p) => (
            <Pressable
              key={p.ID}
              disabled={disabled}
              onPress={() => remove(p.ID)}
              accessibilityRole="button"
              accessibilityLabel={t('common.clear')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                minHeight: 36,
                borderRadius: 999,
                backgroundColor: mixColors(
                  tokens.textPrimary,
                  tokens.bgSurface1,
                  14,
                ),
              }}
            >
              <Text
                style={{
                  color: tokens.textPrimary,
                  fontSize: 12,
                  fontWeight: '600',
                  maxWidth: 180,
                }}
                numberOfLines={1}
              >
                {partLabel(p, locale)}
              </Text>
              <Text style={{ color: tokens.textSecondary, fontSize: 14 }}>×</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Pressable
        disabled={disabled}
        onPress={() => {
          setQuery('');
          setOpen(true);
        }}
        accessibilityRole="button"
        style={{
          minHeight: 44,
          borderWidth: 1,
          borderRadius: 10,
          borderColor: tokens.border,
          backgroundColor: tokens.bgPage,
          paddingHorizontal: 14,
          justifyContent: 'center',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text style={{ color: tokens.textSecondary, fontSize: 14 }}>
          {t('issue.partFilterPlaceholder')}
        </Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              maxHeight: '70%',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              backgroundColor: tokens.bgSurface1,
              paddingBottom: 24,
            }}
          >
            <View
              style={{
                paddingHorizontal: 16,
                paddingTop: 16,
                paddingBottom: 8,
                borderBottomWidth: 1,
                borderBottomColor: tokens.border,
              }}
            >
              <Text
                style={{
                  color: tokens.textPrimary,
                  fontWeight: '700',
                  fontSize: 16,
                  marginBottom: 10,
                }}
              >
                {t('issue.filterPart')}
              </Text>
              <AppTextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('issue.partFilterSearch')}
                placeholderTextColor={tokens.textSecondary}
                autoCorrect={false}
                style={{
                  borderWidth: 1,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 15,
                  minHeight: 44,
                  backgroundColor: tokens.bgPage,
                  borderColor: tokens.border,
                  color: tokens.textPrimary,
                }}
              />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {options.length === 0 ? (
                <Text
                  style={{
                    color: tokens.textSecondary,
                    padding: 16,
                    fontSize: 13,
                  }}
                >
                  {t('issue.partFilterNone')}
                </Text>
              ) : (
                options.map((p) => {
                  const selected = selectedIds.has(p.ID);
                  return (
                    <Pressable
                      key={p.ID}
                      onPress={() => toggle(p.ID)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        borderBottomWidth: 1,
                        borderBottomColor: tokens.border,
                        backgroundColor: selected
                          ? mixColors(tokens.textPrimary, tokens.bgSurface1, 10)
                          : 'transparent',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                          borderWidth: 1,
                          borderColor: tokens.border,
                          backgroundColor: selected
                            ? tokens.textPrimary
                            : tokens.bgPage,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {selected ? (
                          <Text
                            style={{
                              color: tokens.bgPage,
                              fontSize: 12,
                              fontWeight: '700',
                            }}
                          >
                            ✓
                          </Text>
                        ) : null}
                      </View>
                      <Text
                        style={{
                          color: selected
                            ? tokens.textPrimary
                            : tokens.textSecondary,
                          fontSize: 15,
                          fontWeight: selected ? '600' : '500',
                          flex: 1,
                        }}
                      >
                        {partLabel(p, locale)}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
            <Pressable
              onPress={() => setOpen(false)}
              style={{
                marginHorizontal: 16,
                marginTop: 12,
                minHeight: 44,
                borderRadius: 10,
                backgroundColor: mixColors(
                  tokens.textPrimary,
                  tokens.bgSurface1,
                  12,
                ),
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: tokens.textPrimary, fontWeight: '700', fontSize: 15 }}>
                {t('common.done')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
