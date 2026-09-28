import { createRoot } from 'react-dom/client';
import { Text, View } from 'react-native';
import { ThemeProvider, useTheme } from '../../../../mobile/src/theme/ThemeProvider';
import { I18nProvider } from '../../../../mobile/src/i18n';
import VehicleStationScreen from '../../../../mobile/src/screens/VehicleStationScreen';
import { SeverityIndicator } from '../../../../mobile/src/components/SeverityIndicator';

const params = new URLSearchParams(location.search);
window.__KAREA_STORE = {
  'karea-theme-mode': params.get('theme') ?? 'light',
  'karea-locale': params.get('locale') ?? 'tr',
};

function SeverityCompare() {
  const { tokens } = useTheme();
  const levels = ['LOW', 'MEDIUM', 'CRITICAL'] as const;
  const labels = { LOW: 'LOW · 1', MEDIUM: 'MEDIUM · 2', CRITICAL: 'CRITICAL · 3' };
  const rows = [
    { size: 'sm', gray: false },
    { size: 'md', gray: false },
    { size: 'md', gray: true },
  ] as const;
  return (
    <View style={{ padding: 20, backgroundColor: tokens.bgPage, gap: 18 }}>
      {rows.map(({ size, gray }) => (
        <View
          key={`${size}-${gray}`}
          style={[
            { flexDirection: 'row', gap: 28, alignItems: 'flex-end' },
            gray ? ({ filter: 'grayscale(1)' } as object) : null,
          ]}
        >
          {levels.map((lvl) => (
            <View key={lvl} style={{ alignItems: 'center', gap: 6, width: 96 }}>
              <SeverityIndicator severity={lvl} size={size} />
              <Text style={{ color: tokens.textSecondary, fontSize: 11 }}>
                {labels[lvl]} · {size}
                {gray ? ' · gri' : ''}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        {params.get('view') === 'severity' ? <SeverityCompare /> : <VehicleStationScreen />}
      </I18nProvider>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
