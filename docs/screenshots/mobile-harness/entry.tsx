import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../mobile/src/theme/ThemeProvider';
import { I18nProvider } from '../../../mobile/src/i18n';
import VehicleStationScreen from '../../../mobile/src/screens/VehicleStationScreen';
import ShipmentChecklistScreen from '../../../mobile/src/screens/ShipmentChecklistScreen';
import TestChecklistScreen from '../../../mobile/src/screens/TestChecklistScreen';
import EOLChecklistScreen from '../../../mobile/src/screens/EOLChecklistScreen';
import { activeScene, type ScreenMap } from './scenes';

const params = new URLSearchParams(location.search);
window.__nav = [];
window.__calls = [];
window.__KAREA_STORE = {
  'karea-theme-mode': params.get('theme') ?? 'light',
  'karea-locale': params.get('locale') ?? 'tr',
};

const screens: ScreenMap = {
  'vehicle-station': VehicleStationScreen,
  shipment: ShipmentChecklistScreen,
  test: TestChecklistScreen,
  eol: EOLChecklistScreen,
};
const Screen = screens[activeScene().screen];

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <I18nProvider>
      <Screen />
    </I18nProvider>
  </ThemeProvider>,
);
