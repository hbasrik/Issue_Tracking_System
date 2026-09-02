import { useEffect, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
  type TextInputProps,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n';

let multilineFocused = false;
const focusListeners = new Set<() => void>();

function setMultilineFocused(next: boolean) {
  if (multilineFocused === next) return;
  multilineFocused = next;
  focusListeners.forEach((l) => l());
}

function subscribeMultilineFocus(listener: () => void) {
  focusListeners.add(listener);
  return () => {
    focusListeners.delete(listener);
  };
}

/** Merge into multiline TextInput onFocus/onBlur (also applied by AppTextInput). */
export function multilineDoneInputProps(
  onFocus?: TextInputProps['onFocus'],
  onBlur?: TextInputProps['onBlur'],
): Pick<TextInputProps, 'onFocus' | 'onBlur'> {
  return {
    onFocus: (e) => {
      setMultilineFocused(true);
      onFocus?.(e);
    },
    onBlur: (e) => {
      setMultilineFocused(false);
      onBlur?.(e);
    },
  };
}

/**
 * @deprecated Use AppTextInput with multiline — focus tracking is automatic.
 * Kept so existing spreads are harmless no-ops.
 */
export const iosDoneAccessoryProps = {};

/** FlatList / ScrollView: unhandled taps dismiss; drag also dismisses. */
export const listKeyboardDismissProps = {
  keyboardShouldPersistTaps: 'handled' as const,
  keyboardDismissMode: 'on-drag' as const,
};

/**
 * Floating "Bitti" bar above the keyboard for multiline fields.
 * InputAccessoryView does not work reliably with multiline TextInput on
 * current React Native / Expo (shared nativeID breaks; multiline unsupported).
 */
export function KeyboardDoneAccessory() {
  const { tokens } = useTheme();
  const { t } = useI18n();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [focused, setFocused] = useState(multilineFocused);

  useEffect(() => subscribeMultilineFocus(() => setFocused(multilineFocused)), []);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (!focused || keyboardHeight <= 0) return null;

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View
        style={[
          styles.bar,
          {
            bottom: keyboardHeight,
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
          <Text style={[styles.doneText, { color: tokens.accent }]}>
            {t('common.done')}
          </Text>
        </Pressable>
      </View>
    </View>
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
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
