import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { forwardRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { inkOn, statusColors } from '../theme/tokens';

export function Screen({
  children,
  padded = true,
  safe = false,
}: {
  children: React.ReactNode;
  padded?: boolean;
  /** Headerless screens — inset from notch / home indicator / landscape sides. */
  safe?: boolean;
}) {
  const { tokens } = useTheme();
  const style = [
    styles.flex,
    { backgroundColor: tokens.bgPage },
    padded && styles.pad,
  ];
  if (safe) {
    return (
      <SafeAreaView
        style={style}
        edges={['top', 'bottom', 'left', 'right']}
      >
        {children}
      </SafeAreaView>
    );
  }
  return <View style={style}>{children}</View>;
}

/** Text field whose focus border uses the brand accent (Satsuma). */
export const AppTextInput = forwardRef<TextInput, TextInputProps>(
  function AppTextInput(
    { style, onFocus, onBlur, selectionColor, cursorColor, ...rest },
    ref,
  ) {
    const { tokens } = useTheme();
    const [focused, setFocused] = useState(false);
    return (
      <TextInput
        ref={ref}
        underlineColorAndroid="transparent"
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        selectionColor={selectionColor ?? tokens.accent}
        cursorColor={cursorColor ?? tokens.accent}
        style={[style, focused ? { borderColor: tokens.accent } : null]}
      />
    );
  },
);

export function Title({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  return <Text style={[styles.title, { color: tokens.textPrimary }]}>{children}</Text>;
}

export function Subtitle({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <Text style={[styles.subtitle, { color: tokens.textSecondary }]}>{children}</Text>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const { tokens } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: tokens.bgSurface1, borderColor: tokens.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const { tokens } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: danger ? statusColors.notOk : tokens.accent,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

export function OutlineButton({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const { tokens } = useTheme();
  const color = danger ? statusColors.notOk : tokens.accent;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.outlineBtn,
        { borderColor: color, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={[styles.outlineText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({
  label,
  color,
}: {
  label: string;
  color: string;
}) {
  const ink = inkOn(color);
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={[styles.badgeText, { color: ink }]}>{label}</Text>
    </View>
  );
}

export function Loading() {
  const { tokens } = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={tokens.accent} />
    </View>
  );
}

export function ErrorText({ children }: { children: string }) {
  return <Text style={styles.error}>{children}</Text>;
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <Text style={[styles.sectionHeading, { color: tokens.accent }]}>{children}</Text>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: 16 },
  title: { fontSize: 24, fontWeight: '600' },
  subtitle: { marginTop: 4, fontSize: 13, fontWeight: '500' },
  sectionHeading: { fontSize: 15, fontWeight: '600' },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  btn: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  outlineBtn: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  outlineText: { fontSize: 15, fontWeight: '600' },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { marginTop: 8, color: statusColors.notOk, fontSize: 13 },
});
