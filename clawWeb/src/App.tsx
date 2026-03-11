import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import './App.css';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { CharactersPage } from './pages/Characters';
import { WritingPage } from './pages/Writing';
import { GraphPage } from './pages/Graph';
import { AudioPage } from './pages/Audio';
import { VideoPage } from './pages/Video';
import { KnowledgePage } from './pages/Knowledge';
import { VirtualFolderPage } from './pages/VirtualFolder';
import { AccountPage } from './pages/Account';
import { AdminUsersPage } from './pages/admin/Users';
import { AdminStatsPage } from './pages/admin/Stats';
import { AdminTasksPage } from './pages/admin/Tasks';
import { AppLayout } from './layouts/AppLayout';
import { useAuth } from './context/AuthContext';

function RequireAuth() {
  const { isLoggedIn } = useAuth();
  const location = useLocation();

  if (!isLoggedIn) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/characters" element={<CharactersPage />} />
          <Route path="/writing" element={<WritingPage />} />
          <Route path="/graph" element={<GraphPage />} />
          <Route path="/audio" element={<AudioPage />} />
          <Route path="/video" element={<VideoPage />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="/virtual-folder" element={<VirtualFolderPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/stats" element={<AdminStatsPage />} />
          <Route path="/admin/tasks" element={<AdminTasksPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
