import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireManager } from './auth/RequireManager';
import { AppShell } from './components/AppShell';
import AnalysisPage from './pages/AnalysisPage';
import HomePage from './pages/HomePage';
import IssuesPage from './pages/IssuesPage';
import LoginPage from './pages/LoginPage';
import NotAuthorizedPage from './pages/NotAuthorizedPage';
import SettingsPage from './pages/SettingsPage';
import TemplatesPage from './pages/TemplatesPage';
import UsersPage from './pages/UsersPage';
import VehicleDetailPage from './pages/VehicleDetailPage';
import VehiclesPage from './pages/VehiclesPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/not-authorized" element={<NotAuthorizedPage />} />

      <Route element={<RequireManager />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/vehicles" element={<VehiclesPage />} />
          <Route path="/vehicles/:vin" element={<VehicleDetailPage />} />
          <Route path="/issues" element={<IssuesPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
