import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { AppShell, AskWill } from '@deal-platform/shared-ui';
import { useAuth } from '@deal-platform/shared-auth';
import Footer from './components/Footer';

import picLogo from './assets/pic-logo.png';

export default function App() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

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
