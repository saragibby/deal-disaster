import { useState, useCallback } from 'react';
import { useAuth, buildAppUrl } from '@deal-platform/shared-auth';
import { AskWill } from '@deal-platform/shared-ui';
import type { AskWillProps } from '@deal-platform/shared-ui';
import { LogOut, User } from 'lucide-react';
import { Footer } from '@deal-platform/shared-ui';
import PropertyAnalyzer from './components/PropertyAnalyzer';
import LoginGate from './components/LoginGate';

export default function App() {
  const { isAuthenticated, loading, user } = useAuth();
  const [propertyAnalysis, setPropertyAnalysis] = useState<AskWillProps['propertyAnalysis']>();

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }, []);

  if (!loading && !isAuthenticated) {
    window.location.href = '/login';
    return null;
  }

  return (
    <div className="analyzer-app">
      {/* Minimal header — transparent on gradient */}
      <header className="analyzer-app__header">
        <a href={buildAppUrl('/')} className="analyzer-app__logo">
          ⚡ Passive Income Club
        </a>

        <nav className="analyzer-app__nav">
          <a href={buildAppUrl('/')} className="analyzer-app__nav-link">Home</a>
          <a href={buildAppUrl('/games')} className="analyzer-app__nav-link">Games</a>
          <a href={buildAppUrl('/tools')} className="analyzer-app__nav-link">Tools</a>

          {isAuthenticated && user ? (
            <>
              <a href={buildAppUrl('/profile')} className="analyzer-app__user">
                <User size={16} /> {user.name || user.email}
              </a>
              <button className="analyzer-app__logout" onClick={handleLogout} title="Sign out">
                <LogOut size={14} />
              </button>
            </>
          ) : null}
        </nav>
      </header>

      {/* Main content */}
      <main className="analyzer-app__content">
        <PropertyAnalyzer onAnalysisComplete={setPropertyAnalysis} />
      </main>

      {isAuthenticated && <AskWill propertyAnalysis={propertyAnalysis} />}
      <Footer />
    </div>
  );
}
