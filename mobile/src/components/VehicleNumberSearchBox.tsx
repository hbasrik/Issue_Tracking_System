import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { ApiError, api, type Vehicle } from '../api/client';
import { useTheme } from '../theme/ThemeProvider';
import { ErrorText, PrimaryButton, Subtitle } from './ui';

/**
 * Looks a vehicle up by the short factory number printed on the body
 * (GET /vehicles/resolve?vehicle_number=). Unlike the VIN box this resolves to
 * exactly one vehicle, so there is no result list to choose from.
 */
export function VehicleNumberSearchBox({
  onSelect,
}: {
  onSelect: (v: Vehicle) => void;
}) {
  const { tokens } = useTheme();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function resolve() {
    const number = value.trim();
    if (!number) {
      setError('Araç numarası gerekli');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const vehicle = await api.resolveVehicle(number);
      onSelect(vehicle);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError(`${number} numaralı araç bulunamadı`);
      } else {
        setError(err instanceof Error ? err.message : 'Arama başarısız');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <TextInput
        value={value}
        onChangeText={setValue}
        onSubmitEditing={resolve}
        placeholder="Araç no (örn. 12345)"
        placeholderTextColor={tokens.textSecondary}
        keyboardType="number-pad"
        autoCorrect={false}
        returnKeyType="search"
        style={[
          styles.input,
          {
            backgroundColor: tokens.bgSurface1,
            borderColor: tokens.border,
            color: tokens.textPrimary,
          },
        ]}
      />
      <View style={{ marginTop: 8 }}>
        <PrimaryButton
          label={busy ? 'Aranıyor…' : 'Bul'}
          onPress={resolve}
          disabled={busy}
        />
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Subtitle>Araç numarası VIN ile aynı kaydı açar</Subtitle>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 44,
  },
});
