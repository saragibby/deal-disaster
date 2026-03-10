import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { AppShell, AskWill, Footer } from '@deal-platform/shared-ui';
import { useAuth } from '@deal-platform/shared-auth';

import picLogo from './assets/pic-logo.png';

export default function App() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // Wait for auth state to be restored from localStorage before deciding
  if (loading) {
    return null;
  }

  // Redirect unauthenticated users to login page
  if (!isAuthenticated && location.pathname !== '/login' && location.pathname !== '/reset-password') {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppShell title="Passive Income Club" logoSrc={picLogo} footer={<Footer />}>
      <Outlet />
      {isAuthenticated && <AskWill />}
    </AppShell>
  );
}
