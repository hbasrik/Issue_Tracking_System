import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../../mobile/src/theme/ThemeProvider';
import { I18nProvider } from '../../../mobile/src/i18n';
import VehicleStationScreen from '../../../mobile/src/screens/VehicleStationScreen';
import ShipmentChecklistScreen from '../../../mobile/src/screens/ShipmentChecklistScreen';
import TestChecklistScreen from '../../../mobile/src/screens/TestChecklistScreen';
import EOLChecklistScreen from '../../../mobile/src/screens/EOLChecklistScreen';
import MyIssuesScreen from '../../../mobile/src/screens/MyIssuesScreen';
import IssueDetailScreen from '../../../mobile/src/screens/IssueDetailScreen';
import PendingReportsScreen from '../../../mobile/src/screens/PendingReportsScreen';
import { ReferenceCacheProvider } from '../../../mobile/src/offline/ReferenceCacheProvider';
import { IssueReportQueueProvider } from '../../../mobile/src/offline/IssueReportQueueProvider';
import { resetConnectivityForTests } from '../../../mobile/src/offline/connectivityStore';
import { activeScene, type ScreenMap } from './scenes';

const params = new URLSearchParams(location.search);
window.__nav = [];
window.__calls = [];
window.__KAREA_STORE = {
  'karea-theme-mode': params.get('theme') ?? 'light',
  'karea-locale': params.get('locale') ?? 'tr',
};
const scene = activeScene();
if (scene.harness?.offline) resetConnectivityForTests(false);
if (scene.live) {
  window.__KAREA_STORE['karea.issueReportQueue.v1'] = JSON.stringify({
    [String(scene.live.userId)]: scene.live.queue,
  });
}

const screens: ScreenMap = {
  'vehicle-station': VehicleStationScreen,
  shipment: ShipmentChecklistScreen,
  test: TestChecklistScreen,
  eol: EOLChecklistScreen,
  'my-issues': MyIssuesScreen,
  'issue-detail': IssueDetailScreen,
  'pending-reports': PendingReportsScreen,
};
const Screen = screens[scene.screen];

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <I18nProvider>
      {scene.live ? (
        <ReferenceCacheProvider>
          <IssueReportQueueProvider>
            <Screen />
          </IssueReportQueueProvider>
        </ReferenceCacheProvider>
      ) : (
        <Screen />
      )}
    </I18nProvider>
  </ThemeProvider>,
);
