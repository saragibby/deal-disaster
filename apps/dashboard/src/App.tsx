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

  // Landing page takes over the full viewport for unauthenticated users on "/"
  if (!isAuthenticated && location.pathname === '/') {
    return (
      <>
        <Outlet />
        <Footer />
      </>
    );
  }

  // Redirect unauthenticated users to home page for all other routes
  if (!isAuthenticated && location.pathname !== '/') {
    return <Navigate to="/" replace />;
  }

  return (
    <AppShell title="Passive Income Club" logoSrc={picLogo} footer={<Footer />}>
      <Outlet />
      {isAuthenticated && <AskWill />}
    </AppShell>
  );
}
