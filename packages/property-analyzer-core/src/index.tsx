import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  GitCompareArrows,
  History,
  Home,
  LogOut,
  Menu,
  Search,
  User,
  X,
} from 'lucide-react';
import type {
  AnalyzerAssistantContext,
  AnalyzerRoute,
  PropertyAnalyzerCoreProps,
} from '@deal-platform/shared-types';
import PropertyAnalyzer from './components/PropertyAnalyzer.js';
import SharedAnalysisView from './components/SharedAnalysisView.js';
import { PropertyAnalyzerCoreProvider, type AnalyzerTab } from './context.js';

export type {
  AIComparisonSummary,
  AIPropertyNarrative,
  AnalysisParams,
  AnalyzerApiAdapter,
  AnalyzerApiClient,
  AnalyzerAssistantContext,
  AnalyzerAuthAdapter,
  AnalyzerDerivedAdjustments,
  AnalyzerError,
  AnalyzerErrorCode,
  AnalyzerExportKind,
  AnalyzerNavigationAdapter,
  AnalyzerNavigationOptions,
  AnalyzerPermission,
  AnalyzerPlatform,
  AnalyzerRoute,
  AnalyzerSession,
  AnalyzerSessionRequirement,
  AnalyzerShareState,
  AnalyzerShareUrlBuilder,
  AnalyzerStorageAdapter,
  OwnerContext,
  PageInput,
  PagedResult,
  PropertyAnalysis,
  PropertyAnalyzerAdapters,
  PropertyAnalyzerBranding,
  PropertyAnalyzerCoreEvents,
  PropertyAnalyzerCoreProps,
  PropertyAnalyzerFeatureFlags,
  PropertyAnalyzerShellSlots,
  RunAnalysisInput,
  SaveAdjustmentsPayload,
  SavedComparison,
} from '@deal-platform/shared-types';

export { usePropertyAnalyzerCore } from './context.js';

function tabForRoute(route: AnalyzerRoute): AnalyzerTab {
  if (route.kind === 'compare') return 'compare';
  if (route.kind === 'history') return 'history';
  return 'analyze';
}

export function PropertyAnalyzerCore(props: PropertyAnalyzerCoreProps): ReactElement | null {
  const {
    basePath,
    initialRoute,
    adapters,
    features,
    branding,
    shellSlots,
    onAnalysisContextChange,
  } = props;
  const [route, setRoute] = useState<AnalyzerRoute>(initialRoute);
  const [activeTab, setActiveTab] = useState<AnalyzerTab>(tabForRoute(initialRoute));
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionDisplayName, setSessionDisplayName] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const [assistantContext, setAssistantContextState] = useState<AnalyzerAssistantContext | null>(null);

  const isSharedRoute = initialRoute.kind === 'shared';

  useEffect(() => {
    setRoute(initialRoute);
    setActiveTab(tabForRoute(initialRoute));
    setMobileMenuOpen(false);
  }, [initialRoute]);

  useEffect(() => {
    if (isSharedRoute) {
      setSessionReady(true);
      return;
    }
    if (adapters.auth.isLoading) {
      setSessionReady(false);
      return;
    }
    let cancelled = false;
    adapters.auth.requireSession('private-analysis')
      .then(session => {
        if (cancelled) return;
        setSessionDisplayName(session.displayName || session.email || null);
        setSessionReady(true);
      })
      .catch(error => {
        if (!cancelled) adapters.auth.onUnauthorized(error);
      });
    return () => {
      cancelled = true;
    };
  }, [adapters.auth, isSharedRoute]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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

  const setAssistantContext = useCallback((context: AnalyzerAssistantContext | null) => {
    setAssistantContextState(context);
    onAnalysisContextChange?.(context);
  }, [onAnalysisContextChange]);

  const changeTab = useCallback((tab: AnalyzerTab) => {
    if (tab === 'compare' && !features.comparisons) return;
    setActiveTab(tab);
    setMobileMenuOpen(false);
    if (tab === 'compare') {
      const next: AnalyzerRoute = { kind: 'compare' };
      setRoute(next);
      adapters.navigation.navigate(next, { replace: true });
      return;
    }
    if (tab === 'history') {
      setRoute({ kind: 'history' });
      return;
    }
    const next: AnalyzerRoute = { kind: 'analyze' };
    setRoute(next);
    adapters.navigation.navigate(next, { replace: true });
  }, [adapters.navigation, features.comparisons]);

  const logoutUrl = adapters.navigation.external('/login');
  const profileUrl = adapters.navigation.external('/profile');
  const homeUrl = adapters.navigation.external('/');
  const analyzerHomeUrl = adapters.navigation.toUrl({ kind: 'analyze' });

  const handleLogout = useCallback(() => {
    adapters.auth.signOut?.();
    adapters.navigation.navigateExternal(logoutUrl);
  }, [adapters.auth, adapters.navigation, logoutUrl]);

  if (isSharedRoute) {
    return (
      <PropertyAnalyzerCoreProvider
        value={{
          basePath,
          route: initialRoute,
          activeTab: 'analyze',
          adapters,
          features,
          branding,
          shellSlots,
          assistantContext,
          setAssistantContext,
          changeTab,
        }}
      >
        <SharedAnalysisView slug={initialRoute.slug} />
      </PropertyAnalyzerCoreProvider>
    );
  }

  if (!sessionReady) {
    return shellSlots?.loadingFallback ? <>{shellSlots.loadingFallback}</> : null;
  }

  return (
    <PropertyAnalyzerCoreProvider
      value={{
        basePath,
        route,
        activeTab,
        adapters,
        features,
        branding,
        shellSlots,
        assistantContext,
        setAssistantContext,
        changeTab,
      }}
    >
      <div className={branding.themeClassName ?? 'analyzer-app'}>
        <header ref={headerRef} className={`analyzer-app__header${scrolled ? ' analyzer-app__header--scrolled' : ''}`}>
          <div className="analyzer-app__header-inner">
            <div className="analyzer-app__brand">
              <a
                href={homeUrl}
                className="analyzer-app__home"
                title={branding.homeLabel}
                aria-label={branding.homeLabel}
              >
                <Home size={20} />
              </a>
              <span className="analyzer-app__brand-divider" aria-hidden="true" />
              <a href={analyzerHomeUrl} className="analyzer-app__logo">
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

                {sessionDisplayName ? (
                  <>
                    <a href={profileUrl} className="analyzer-app__user" onClick={() => setMobileMenuOpen(false)}>
                      <User size={16} /> {sessionDisplayName}
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

        <main className="analyzer-app__content">
          <PropertyAnalyzer />
        </main>

        {shellSlots?.assistant?.(assistantContext)}
        {shellSlots?.footer}
      </div>
    </PropertyAnalyzerCoreProvider>
  );
}

export default PropertyAnalyzerCore;
