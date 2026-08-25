import { Navigate, Route, Routes } from 'react-router-dom';
import { RequirePermission, RequireWebAccess } from './auth/RequirePermission';
import { Perm } from './auth/permissions';
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

      <Route element={<RequireWebAccess />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route element={<RequirePermission code={Perm.VehicleView} />}>
            <Route path="/vehicles" element={<VehiclesPage />} />
            <Route path="/vehicles/:vin" element={<VehicleDetailPage />} />
          </Route>
          <Route element={<RequirePermission code={Perm.IssueView} />}>
            <Route path="/issues" element={<IssuesPage />} />
          </Route>
          <Route element={<RequirePermission code={Perm.AnalysisView} />}>
            <Route path="/analysis" element={<AnalysisPage />} />
          </Route>
          <Route element={<RequirePermission code={Perm.AdminManageMasters} />}>
            <Route path="/templates" element={<TemplatesPage />} />
          </Route>
          <Route element={<RequirePermission code={Perm.AdminManageUsers} />}>
            <Route path="/users" element={<UsersPage />} />
          </Route>
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
