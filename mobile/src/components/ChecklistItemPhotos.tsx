import { useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { mediaFileUrl, mediaThumbUrl, type MediaAttachment } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';

/** Thumbnails of every photo already attached to one checklist item. */
export function ChecklistItemPhotos({ photos }: { photos: MediaAttachment[] }) {
  const { token } = useAuth();
  const { t } = useI18n();
  const { tokens } = useTheme();
  const [open, setOpen] = useState<MediaAttachment | null>(null);
  const shown = photos.filter((p) => p.mime_type?.startsWith('image/'));
  if (shown.length === 0) return null;
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}
      accessibilityLabel={t('media.photos')}
      testID="checklist-item-photos"
    >
      {shown.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => setOpen(p)}
          accessibilityRole="imagebutton"
          accessibilityLabel={t('issueDetail.enlarge', { name: p.file_name })}
        >
          <Image
            source={{ uri: mediaThumbUrl(p.storage_path), headers }}
            style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: tokens.border }}
          />
        </Pressable>
      ))}
      <Modal visible={open != null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 16 }}>
          <Pressable
            onPress={() => setOpen(null)}
            accessibilityRole="button"
            style={{ position: 'absolute', top: 48, right: 16, padding: 12, zIndex: 1 }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{t('common.close')}</Text>
          </Pressable>
          {open ? (
            <Image
              source={{ uri: mediaFileUrl(open.storage_path), headers }}
              accessibilityLabel={open.file_name}
              style={{ width: '100%', height: '80%' }}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}
