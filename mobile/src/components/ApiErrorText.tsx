import { StyleSheet, Text, View } from 'react-native';
import { describeApiError } from '../../../shared/i18n';
import { useI18n } from '../i18n';
import { statusColors } from '../theme/tokens';

type Props = {
  error: unknown;
  color?: string;
};

/**
 * Message plus a discreet selectable request-id line for 5xx failures.
 * The code is selectable so the operator can long-press → Copy.
 */
export function ApiErrorText({ error, color = statusColors.notOk }: Props) {
  const { t } = useI18n();
  const parts =
    typeof error === 'string'
      ? { message: error, requestId: undefined as string | undefined }
      : describeApiError(t, error);
  const { message, requestId } = parts;

  return (
    <View accessibilityRole="alert">
      <Text style={[styles.message, { color }]}>{message}</Text>
      {requestId ? (
        <Text selectable style={[styles.code, { color }]}>
          {t('error.requestCode', { id: requestId })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
  code: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 15,
    opacity: 0.75,
  },
});
