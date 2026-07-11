import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth, buildAppUrl } from '@deal-platform/shared-auth';
import { LogOut, User, Search, GitCompareArrows, History, Home, Menu, X } from 'lucide-react';
import PropertyAnalyzer from './components/PropertyAnalyzer';
import { useAssetDashboardAnalyzer } from './wrapper/AssetDashboardAnalyzerContext';
import type { AnalyzerAssistantContext } from '@deal-platform/shared-types';

export type AnalyzerTab = 'analyze' | 'history' | 'compare';

export default function App() {
  const { isAuthenticated, loading, user, logout } = useAuth();
  const { adapters, features, branding, shellSlots, assistantContext, setAssistantContext } = useAssetDashboardAnalyzer();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const [activeTab, setActiveTab] = useState<AnalyzerTab>(
    location.pathname.endsWith('/compare') ? 'compare' : 'analyze'
  );

  const changeTab = useCallback((tab: AnalyzerTab) => {
    if (tab === 'compare' && !features.comparisons) return;
    setActiveTab(tab);
    setMobileMenuOpen(false);
    if (tab === 'compare') adapters.navigation.navigate({ kind: 'compare' }, { replace: true });
  }, [adapters.navigation, features.comparisons]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

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
    logout();
    window.location.href = '/login';
  }, [logout]);

  if (!loading && !isAuthenticated) {
    void adapters.auth.requireSession('private-analysis').catch(() => undefined);
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
              title={branding.homeLabel}
              aria-label={branding.homeLabel}
            >
              <Home size={20} />
            </a>
            <span className="analyzer-app__brand-divider" aria-hidden="true" />
            <a href={buildAppUrl('/property-analyzer/')} className="analyzer-app__logo">
              {branding.logoText ?? branding.productName}
            </a>
          </div>

          <nav className="analyzer-app__nav" aria-label="Property Analyzer navigation">
            <button
              type="button"
              className="analyzer-app__menu-toggle"
              onClick={() => setMobileMenuOpen(open => !open)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <div className={`analyzer-app__nav-menu${mobileMenuOpen ? ' analyzer-app__nav-menu--open' : ''}`}>
              <button
                type="button"
                className={`analyzer-app__nav-link analyzer-app__nav-tab${activeTab === 'analyze' ? ' analyzer-app__nav-tab--active' : ''}`}
                onClick={() => changeTab('analyze')}
              >
                <Search size={16} /> Analyze
              </button>
              {features.comparisons && (
                <button
                  type="button"
                  className={`analyzer-app__nav-link analyzer-app__nav-tab${activeTab === 'compare' ? ' analyzer-app__nav-tab--active' : ''}`}
                  onClick={() => changeTab('compare')}
                >
                  <GitCompareArrows size={16} /> Compare
                </button>
              )}
              <button
                type="button"
                className={`analyzer-app__nav-link analyzer-app__nav-tab${activeTab === 'history' ? ' analyzer-app__nav-tab--active' : ''}`}
                onClick={() => changeTab('history')}
              >
                <History size={16} /> History
              </button>

              {isAuthenticated && user ? (
                <>
                  <a href={buildAppUrl('/profile')} className="analyzer-app__user" onClick={() => setMobileMenuOpen(false)}>
                    <User size={16} /> {user.name || user.email}
                  </a>
                  <button className="analyzer-app__logout" onClick={handleLogout} title="Sign out">
                    <LogOut size={14} />
                  </button>
                </>
              ) : null}
            </div>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="analyzer-app__content">
        <PropertyAnalyzer
          onAnalysisComplete={(context: AnalyzerAssistantContext) => setAssistantContext(context)}
          activeTab={activeTab}
          onTabChange={changeTab}
        />
      </main>

      {shellSlots?.assistant?.(assistantContext)}
      {shellSlots?.footer}
    </div>
  );
}
