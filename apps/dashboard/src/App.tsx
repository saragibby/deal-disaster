import { Outlet } from 'react-router-dom';
import { AppShell, AskWill } from '@deal-platform/shared-ui';
import { useAuth } from '@deal-platform/shared-auth';
import Footer from './components/Footer';

import picLogo from './assets/pic-logo.png';

export default function App() {
  const { isAuthenticated } = useAuth();

  return (
    <AppShell title="Passive Income Club" logoSrc={picLogo} footer={<Footer />}>
      <Outlet />
      {isAuthenticated && <AskWill />}
    </AppShell>
  );
}
