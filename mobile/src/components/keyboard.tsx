import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n';

/** Shared by every multiline TextInput so one iOS toolbar serves the app. */
export const KEYBOARD_DONE_NATIVE_ID = 'karea.keyboard.done';

/**
 * Spread onto multiline TextInput. iOS shows the "Bitti" bar; Android ignores
 * inputAccessoryViewID. Do not set returnKeyType=done here — Enter must insert
 * a newline.
 */
export const iosDoneAccessoryProps =
  Platform.OS === 'ios'
    ? { inputAccessoryViewID: KEYBOARD_DONE_NATIVE_ID }
    : {};

/** FlatList / ScrollView: unhandled taps dismiss; drag also dismisses. */
export const listKeyboardDismissProps = {
  keyboardShouldPersistTaps: 'handled' as const,
  keyboardDismissMode: 'on-drag' as const,
};

/**
 * iOS toolbar above the keyboard. Android: hardware/back (and the keyboard's
 * own hide control) already dismisses — no extra chrome.
 */
export function KeyboardDoneAccessory() {
  const { tokens } = useTheme();
  const { t } = useI18n();
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE_NATIVE_ID}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: tokens.bgSurface1,
            borderTopColor: tokens.border,
          },
        ]}
      >
        <Pressable
          onPress={() => Keyboard.dismiss()}
          hitSlop={8}
          style={styles.doneHit}
          accessibilityRole="button"
          accessibilityLabel={t('common.dismissKeyboard')}
        >
          <Text style={[styles.doneText, { color: tokens.accent }]}>{t('common.done')}</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

/**
 * Form ScrollView: tap empty space (labels, padding) to dismiss, without
 * making Enter dismiss a multiline field.
 */
export function DismissKeyboardScrollView({
  children,
  contentContainerStyle,
  ...rest
}: ScrollViewProps) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={styles.grow}
      {...rest}
    >
      <Pressable
        onPress={Keyboard.dismiss}
        accessible={false}
        style={[styles.grow, contentContainerStyle]}
      >
        {children}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  doneHit: {
    minHeight: 44,
    minWidth: 64,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
  },
  doneText: {
    fontSize: 16,
    fontWeight: '600',
  },
  grow: {
    flexGrow: 1,
  },
});
