import { useState, useCallback, useEffect } from 'react';
import { useAuth, buildAppUrl } from '@deal-platform/shared-auth';
import { AskWill } from '@deal-platform/shared-ui';
import type { AskWillProps } from '@deal-platform/shared-ui';
import { LogOut, User } from 'lucide-react';
import { Footer } from '@deal-platform/shared-ui';
import PropertyAnalyzer from './components/PropertyAnalyzer';
import { SectionNav } from './components/SectionNav';
import type { SectionSignal } from './components/SectionNav';

export default function App() {
  const { isAuthenticated, loading, user } = useAuth();
  const [propertyAnalysis, setPropertyAnalysis] = useState<AskWillProps['propertyAnalysis']>();
  const [sectionSignals, setSectionSignals] = useState<SectionSignal[] | null>(null);
  const [scrolled, setScrolled] = useState(false);

  // Toggle a solid/elevated header once the user scrolls past the hero.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
      {/* Minimal header — transparent on gradient, sticky once scrolled */}
      <header className={`analyzer-app__header${scrolled ? ' analyzer-app__header--scrolled' : ''}`}>
        <div className="analyzer-app__header-inner">
          <a href={buildAppUrl('/')} className="analyzer-app__logo">
            ⚡ Passive Income Club
          </a>

          <nav className="analyzer-app__nav">
            {sectionSignals ? (
              <SectionNav signals={sectionSignals} />
            ) : (
              <>
                <a href={buildAppUrl('/')} className="analyzer-app__nav-link">Home</a>
                <a href={buildAppUrl('/games')} className="analyzer-app__nav-link">Games</a>
                <a href={buildAppUrl('/tools')} className="analyzer-app__nav-link">Tools</a>
              </>
            )}

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
        </div>
      </header>

      {/* Main content */}
      <main className="analyzer-app__content">
        <PropertyAnalyzer onAnalysisComplete={setPropertyAnalysis} onSignalsChange={setSectionSignals} />
      </main>

      {isAuthenticated && import.meta.env.VITE_DISABLE_ASK_WILL !== 'true' && <AskWill propertyAnalysis={propertyAnalysis} />}
      <Footer />
    </div>
  );
}
