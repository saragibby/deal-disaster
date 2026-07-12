import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  analyzerApi,
  buildAppUrl,
  useAuth,
} from '@deal-platform/shared-auth';
import { AskWill, Footer } from '@deal-platform/shared-ui';
import type {
  AnalyzerAssistantContext,
  AnalyzerAuthAdapter,
  AnalyzerNavigationAdapter,
  AnalyzerPermission,
  AnalyzerRoute,
  AnalyzerSession,
  AnalyzerSessionRequirement,
  AnalyzerShareUrlBuilder,
  AnalyzerStorageAdapter,
  PropertyAnalyzerBranding,
  PropertyAnalyzerCoreProps,
  PropertyAnalyzerFeatureFlags,
  PropertyAnalyzerShellSlots,
} from '@deal-platform/property-analyzer-core';

const BASE_PATH = '/property-analyzer';
const STORAGE_PREFIX = 'property-analyzer:';
const AUTH_STORAGE_KEYS = new Set(['token', 'user']);
const ANALYZER_PERMISSIONS: AnalyzerPermission[] = [
  'analysis:read',
  'analysis:write',
  'analysis:delete',
  'analysis:share',
  'comparison:read',
  'comparison:write',
];

declare global {
  interface Window {
    __PROPERTY_ANALYZER_FLAGS__?: Partial<PropertyAnalyzerFeatureFlags>;
  }
}

interface AssetDashboardAnalyzerContextValue extends PropertyAnalyzerCoreProps {
  assistantContext: AnalyzerAssistantContext | null;
  setAssistantContext: (context: AnalyzerAssistantContext | null) => void;
}

const AssetDashboardAnalyzerContext = createContext<AssetDashboardAnalyzerContextValue | null>(null);

function redirectToLogin(): never {
  window.location.href = '/login';
  throw new Error('Authentication required.');
}

function toAnalyzerSession(auth: ReturnType<typeof useAuth>): AnalyzerSession | null {
  if (!auth.isAuthenticated || !auth.user) return null;
  return {
    userId: String(auth.user.id),
    email: auth.user.email,
    displayName: auth.user.name,
    token: auth.token ?? undefined,
    tenantId: 'asset-dashboard',
    roles: auth.user.is_admin ? ['admin', 'user'] : ['user'],
    permissions: auth.user.is_admin
      ? [...ANALYZER_PERMISSIONS, 'provider-cache:read', 'provider-cache:write', 'admin:tenant']
      : ANALYZER_PERMISSIONS,
  };
}

function parseInitialRoute(location: ReturnType<typeof useLocation>): AnalyzerRoute {
  const path = location.pathname.replace(/\/+$/, '');
  if (path.startsWith('/analysis/')) {
    return { kind: 'analyze', slug: decodeURIComponent(path.slice('/analysis/'.length)) };
  }
  if (path === '/compare') {
    const props = new URLSearchParams(location.search).get('props');
    return { kind: 'compare', propertySlugs: props ? props.split(',').filter(Boolean) : undefined };
  }
  if (path.startsWith('/shared/')) {
    return { kind: 'shared', slug: decodeURIComponent(path.slice('/shared/'.length)) };
  }
  return { kind: 'analyze' };
}

function routeToInternalPath(route: AnalyzerRoute): string {
  switch (route.kind) {
    case 'history':
      return '/';
    case 'analyze':
      return route.slug ? `/analysis/${encodeURIComponent(route.slug)}` : '/';
    case 'compare': {
      const props = route.propertySlugs?.filter(Boolean).map(encodeURIComponent).join(',');
      return props ? `/compare?props=${props}` : '/compare';
    }
    case 'shared':
      return `/shared/${encodeURIComponent(route.slug)}`;
  }
}

function routeToAppPath(route: AnalyzerRoute): string {
  const internal = routeToInternalPath(route);
  return internal === '/' ? `${BASE_PATH}/` : `${BASE_PATH}${internal}`;
}

function buildAbsoluteAppUrl(path: string): string {
  const relative = path.startsWith('/') ? path : `/${path}`;
  if (typeof window === 'undefined') return `${BASE_PATH}${relative}`;
  return `${window.location.origin}${BASE_PATH}${relative}`;
}

function createStorageAdapter(): AnalyzerStorageAdapter {
  const scopedKey = (key: string) => {
    if (AUTH_STORAGE_KEYS.has(key)) {
      throw new Error(`Property Analyzer core storage cannot access auth key "${key}".`);
    }
    return `${STORAGE_PREFIX}${key}`;
  };

  return {
    get<T>(key: string): T | null {
      const raw = localStorage.getItem(scopedKey(key));
      if (raw == null) return null;
      return JSON.parse(raw) as T;
    },
    set<T>(key: string, value: T) {
      localStorage.setItem(scopedKey(key), JSON.stringify(value));
    },
    remove(key: string) {
      localStorage.removeItem(scopedKey(key));
    },
  };
}

function createFeatureFlags(): PropertyAnalyzerFeatureFlags {
  const runtime = window.__PROPERTY_ANALYZER_FLAGS__ ?? {};
  return {
    askWill: import.meta.env.VITE_DISABLE_ASK_WILL !== 'true' && runtime.askWill !== false,
    comparisons: runtime.comparisons !== false,
    savedComparisons: runtime.savedComparisons !== false,
    publicSharing: runtime.publicSharing !== false,
    pdfExport: runtime.pdfExport !== false,
    streetView: runtime.streetView !== false,
    aiComparisonSummary: runtime.aiComparisonSummary !== false,
    aiPropertyNarratives: runtime.aiPropertyNarratives !== false,
  };
}

export function AssetDashboardAnalyzerProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [assistantContext, setAssistantContext] = useState<AnalyzerAssistantContext | null>(null);

  const session = useMemo(() => toAnalyzerSession(auth), [auth.isAuthenticated, auth.token, auth.user]);
  const authAdapter = useMemo<AnalyzerAuthAdapter>(() => ({
    async getSession() {
      return session;
    },
    async requireSession(_reason: AnalyzerSessionRequirement) {
      return session ?? redirectToLogin();
    },
    onUnauthorized() {
      redirectToLogin();
    },
  }), [session]);

  const navigation = useMemo<AnalyzerNavigationAdapter>(() => ({
    currentUrl() {
      return new URL(window.location.href);
    },
    toUrl(route) {
      return routeToAppPath(route);
    },
    navigate(route, options) {
      navigate(routeToInternalPath(route), { replace: options?.replace });
    },
    external(path) {
      return buildAppUrl(path);
    },
  }), [navigate]);

  const shareUrls = useMemo<AnalyzerShareUrlBuilder>(() => ({
    analysis(slug) {
      return buildAbsoluteAppUrl(`/analysis/${encodeURIComponent(slug)}`);
    },
    publicAnalysis(slug) {
      return buildAbsoluteAppUrl(`/shared/${encodeURIComponent(slug)}`);
    },
    privateComparison(propertySlugs) {
      const props = propertySlugs.filter(Boolean).map(encodeURIComponent).join(',');
      return props ? buildAbsoluteAppUrl(`/compare?props=${props}`) : buildAbsoluteAppUrl('/compare');
    },
  }), []);

  const features = useMemo(createFeatureFlags, []);
  const branding = useMemo<PropertyAnalyzerBranding>(() => ({
    productName: 'Property Analyzer',
    platformName: 'Passive Income Club',
    logoText: '⚡ Property Analyzer',
    homeLabel: 'Passive Income Club home',
    themeClassName: 'analyzer-app',
  }), []);

  const shellSlots = useMemo<PropertyAnalyzerShellSlots>(() => ({
    footer: <Footer />,
    assistant: (context) => features.askWill && auth.isAuthenticated
      ? <AskWill propertyAnalysis={context ?? undefined} />
      : null,
    publicSharedBanner: <span>📊 Shared Analysis — View Only</span>,
  }), [auth.isAuthenticated, features.askWill]);

  const value = useMemo<AssetDashboardAnalyzerContextValue>(() => ({
    basePath: BASE_PATH,
    initialRoute: parseInitialRoute(location),
    adapters: {
      auth: authAdapter,
      api: analyzerApi,
      navigation,
      storage: createStorageAdapter(),
      shareUrls,
      events: {
        navigate: navigation.navigate,
        shareLinkCopied: () => undefined,
      },
    },
    features,
    branding,
    shellSlots,
    onAnalysisContextChange: setAssistantContext,
    assistantContext,
    setAssistantContext,
  }), [assistantContext, authAdapter, branding, features, location, navigation, shareUrls, shellSlots]);

  return (
    <AssetDashboardAnalyzerContext.Provider value={value}>
      {children}
    </AssetDashboardAnalyzerContext.Provider>
  );
}

export function useAssetDashboardAnalyzer() {
  const context = useContext(AssetDashboardAnalyzerContext);
  if (!context) {
    throw new Error('useAssetDashboardAnalyzer must be used within AssetDashboardAnalyzerProvider');
  }
  return context;
}
