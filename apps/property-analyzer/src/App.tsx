import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, buildAppUrl } from '@deal-platform/shared-auth';
import { AskWill } from '@deal-platform/shared-ui';
import type { AskWillProps } from '@deal-platform/shared-ui';
import { LogOut, User, Search, GitCompareArrows, History, Home } from 'lucide-react';
import { Footer } from '@deal-platform/shared-ui';
import PropertyAnalyzer from './components/PropertyAnalyzer';

export type AnalyzerTab = 'analyze' | 'history' | 'compare';

export default function App() {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [propertyAnalysis, setPropertyAnalysis] = useState<AskWillProps['propertyAnalysis']>();
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const [activeTab, setActiveTab] = useState<AnalyzerTab>(
    location.pathname.endsWith('/compare') ? 'compare' : 'analyze'
  );

  const changeTab = useCallback((tab: AnalyzerTab) => {
    setActiveTab(tab);
    if (tab === 'compare') navigate('/compare', { replace: true });
  }, [navigate]);

  // Toggle a solid/elevated header once the user scrolls past the hero.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Publish the live header height so sticky elements can pin flush beneath it.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const setVar = () =>
      document.documentElement.style.setProperty('--analyzer-header-h', `${el.offsetHeight}px`);
    setVar();
    const ro = new ResizeObserver(setVar);
    ro.observe(el);
    window.addEventListener('resize', setVar);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', setVar);
    };
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
      <header ref={headerRef} className={`analyzer-app__header${scrolled ? ' analyzer-app__header--scrolled' : ''}`}>
        <div className="analyzer-app__header-inner">
          <div className="analyzer-app__brand">
            <a
              href={buildAppUrl('/')}
              className="analyzer-app__home"
              title="Passive Income Club home"
              aria-label="Passive Income Club home"
            >
              <Home size={20} />
            </a>
            <span className="analyzer-app__brand-divider" aria-hidden="true" />
            <a href={buildAppUrl('/property-analyzer/')} className="analyzer-app__logo">
              ⚡ Property Analyzer
            </a>
          </div>

          <nav className="analyzer-app__nav">
            <button
              type="button"
              className={`analyzer-app__nav-link analyzer-app__nav-tab${activeTab === 'analyze' ? ' analyzer-app__nav-tab--active' : ''}`}
              onClick={() => changeTab('analyze')}
            >
              <Search size={16} /> Analyze
            </button>
            <button
              type="button"
              className={`analyzer-app__nav-link analyzer-app__nav-tab${activeTab === 'compare' ? ' analyzer-app__nav-tab--active' : ''}`}
              onClick={() => changeTab('compare')}
            >
              <GitCompareArrows size={16} /> Compare
            </button>
            <button
              type="button"
              className={`analyzer-app__nav-link analyzer-app__nav-tab${activeTab === 'history' ? ' analyzer-app__nav-tab--active' : ''}`}
              onClick={() => changeTab('history')}
            >
              <History size={16} /> History
            </button>

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
        <PropertyAnalyzer
          onAnalysisComplete={setPropertyAnalysis}
          activeTab={activeTab}
          onTabChange={changeTab}
        />
      </main>

      {isAuthenticated && import.meta.env.VITE_DISABLE_ASK_WILL !== 'true' && <AskWill propertyAnalysis={propertyAnalysis} />}
      <Footer />
    </div>
  );
}
