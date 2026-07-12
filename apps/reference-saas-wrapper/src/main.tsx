import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PropertyAnalyzerCore } from '@deal-platform/property-analyzer-core';
import type {
  AnalyzerApiClient,
  AnalyzerNavigationAdapter,
  AnalyzerRoute,
  AnalyzerSession,
  AnalyzerStorageAdapter,
  PropertyAnalysis,
  PropertyAnalyzerCoreProps,
} from '@deal-platform/property-analyzer-core';
import {
  DEFAULT_ANALYSIS_PARAMS,
  type AnalysisParams,
  type FullAnalysisResult,
  type MarketStatistics,
  type PropertyData,
  type RentalComp,
  type SavedComparison,
} from '@deal-platform/shared-types';
import '@deal-platform/property-analyzer-core/styles.css';
import './styles.css';

const BASE_PATH = '/investor-lab';
const SAAS_SESSION: AnalyzerSession = {
  userId: 'reference-member-1',
  email: 'member@investor-lab.example',
  displayName: 'Reference SaaS Member',
  tenantId: 'reference-saas-tenant',
  roles: ['member'],
  permissions: [
    'analysis:read',
    'analysis:write',
    'analysis:delete',
    'comparison:read',
  ],
};

function routeFromLocation(location: Location): AnalyzerRoute {
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  const internalPath = pathname.startsWith(BASE_PATH)
    ? pathname.slice(BASE_PATH.length) || '/'
    : pathname;

  if (internalPath.startsWith('/analysis/')) {
    return { kind: 'analyze', slug: decodeURIComponent(internalPath.slice('/analysis/'.length)) };
  }
  if (internalPath === '/compare') {
    const props = new URLSearchParams(location.search).get('props');
    return { kind: 'compare', propertySlugs: props ? props.split(',').filter(Boolean) : undefined };
  }
  if (internalPath.startsWith('/shared/')) {
    return { kind: 'shared', slug: decodeURIComponent(internalPath.slice('/shared/'.length)) };
  }
  return { kind: 'analyze' };
}

function routeToPath(route: AnalyzerRoute): string {
  switch (route.kind) {
    case 'history':
    case 'analyze':
      return route.kind === 'analyze' && route.slug
        ? `${BASE_PATH}/analysis/${encodeURIComponent(route.slug)}`
        : `${BASE_PATH}/`;
    case 'compare': {
      const props = route.propertySlugs?.filter(Boolean).map(encodeURIComponent).join(',');
      return props ? `${BASE_PATH}/compare?props=${props}` : `${BASE_PATH}/compare`;
    }
    case 'shared':
      return `${BASE_PATH}/shared/${encodeURIComponent(route.slug)}`;
  }
}

function absolute(path: string): string {
  const relative = path.startsWith('/') ? path : `/${path}`;
  return `${window.location.origin}${relative}`;
}

function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildProperty(index: number): PropertyData {
  const price = 315000 + index * 22000;
  return {
    zpid: `reference-saas-${index}`,
    address: `${400 + index} Wrapper Smoke Ave`,
    city: index % 2 === 0 ? 'Tampa' : 'Charlotte',
    state: index % 2 === 0 ? 'FL' : 'NC',
    zip: `${33600 + index}`,
    price,
    zestimate: price + 9000,
    rentZestimate: 2300 + index * 150,
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1560 + index * 80,
    lotSize: 5200,
    yearBuilt: 2004 + index,
    propertyType: 'Single Family',
    description: 'Reference SaaS smoke fixture generated without Asset Dashboard auth or shell dependencies.',
    photos: [],
    taxHistory: [{ year: 2025, amount: 3900 + index * 120 }],
    priceHistory: [
      { date: '2024-03-01', price: price - 18000, event: 'Sold' },
      { date: '2026-02-15', price, event: 'Listed for sale' },
    ],
    hoaFee: index === 2 ? 120 : 0,
    latitude: 27.95 + index * 0.01,
    longitude: -82.45 - index * 0.01,
    zillowUrl: `https://example.test/reference-saas/${index}`,
  };
}

function buildParams(property: PropertyData): AnalysisParams {
  return {
    ...DEFAULT_ANALYSIS_PARAMS,
    interestRate: 6.85,
    annualPropertyTax: property.taxHistory?.[0]?.amount ?? DEFAULT_ANALYSIS_PARAMS.annualPropertyTax,
    annualInsurance: 1850,
    monthlyHoa: property.hoaFee ?? 0,
    offerPrice: property.price,
    rentOverride: property.rentZestimate ?? 0,
  };
}

function buildRentalComps(index: number): RentalComp[] {
  return [
    {
      address: `${510 + index} Smoke Rental A`,
      rent: 2200 + index * 125,
      bedrooms: 3,
      bathrooms: 2,
      sqft: 1500,
      distance: 0.5,
      source: 'estimate',
    },
    {
      address: `${620 + index} Smoke Rental B`,
      rent: 2380 + index * 125,
      bedrooms: 3,
      bathrooms: 2,
      sqft: 1620,
      distance: 0.9,
      source: 'estimate',
    },
  ];
}

function buildMarketStatistics(index: number, rent: number): MarketStatistics {
  return {
    medianRent: rent,
    averageRent: rent + 45,
    rentGrowthPct: round(3.1 + index * 0.4, 1),
    totalListings: 32 + index * 7,
    avgDaysOnMarket: 23 + index * 2,
    rentTrend: index === 2 ? 'stable' : 'rising',
  };
}

function marketTrendFor(stats: MarketStatistics): 'up' | 'down' | 'flat' {
  return stats.rentTrend === 'rising' ? 'up' : stats.rentTrend === 'declining' ? 'down' : 'flat';
}

function buildMarketTrendResponse(property: PropertyData, stats: MarketStatistics) {
  const growthTrend = stats.rentGrowthPct > 0 ? 'up' : stats.rentGrowthPct < 0 ? 'down' : 'flat';
  const daysTrend = stats.avgDaysOnMarket <= 30 ? 'up' : stats.avgDaysOnMarket >= 45 ? 'down' : 'flat';
  return {
    data: [
      {
        displayName: `${property.city} Median Rent`,
        score: `$${stats.medianRent.toLocaleString('en-US')}`,
        trend: marketTrendFor(stats),
      },
      {
        displayName: `${property.zip} Rent Growth`,
        score: `${stats.rentGrowthPct >= 0 ? '+' : ''}${stats.rentGrowthPct.toFixed(1)}% YoY`,
        trend: growthTrend,
      },
      {
        displayName: `${property.state} Rental Listings`,
        score: stats.totalListings.toLocaleString('en-US'),
        trend: 'flat',
      },
      {
        displayName: 'Avg Days on Market',
        score: `${stats.avgDaysOnMarket} days`,
        trend: daysTrend,
      },
    ],
  };
}

function buildResults(property: PropertyData, params: AnalysisParams, rentalComps: RentalComp[], marketStatistics: MarketStatistics): FullAnalysisResult {
  const rent = params.rentOverride;
  const loanAmount = property.price * (1 - params.downPaymentPct / 100);
  const monthlyMortgage = round(loanAmount * 0.0065);
  const monthlyTax = round(params.annualPropertyTax / 12);
  const monthlyInsurance = round(params.annualInsurance / 12);
  const monthlyVacancy = round(rent * (params.vacancyPct / 100));
  const monthlyRepairs = round(rent * (params.repairsPct / 100));
  const monthlyCapex = round(rent * (params.capexPct / 100));
  const monthlyManagement = round(rent * (params.managementPct / 100));
  const totalMonthlyExpenses =
    monthlyMortgage +
    monthlyTax +
    monthlyInsurance +
    params.monthlyHoa +
    monthlyVacancy +
    monthlyRepairs +
    monthlyCapex +
    monthlyManagement;
  const monthlyCashFlow = round(rent - totalMonthlyExpenses);
  const annualCashFlow = monthlyCashFlow * 12;
  const totalCashInvested = round(property.price * (params.downPaymentPct / 100) + 8500);

  return {
    mortgage: {
      monthlyPayment: monthlyMortgage,
      loanAmount: round(loanAmount),
      downPayment: round(property.price - loanAmount),
      totalInterest: round(monthlyMortgage * 360 - loanAmount),
    },
    cashFlow: {
      monthlyRent: rent,
      monthlyMortgage,
      monthlyTax,
      monthlyInsurance,
      monthlyHoa: params.monthlyHoa,
      monthlyVacancy,
      monthlyRepairs,
      monthlyCapex,
      monthlyManagement,
      totalMonthlyExpenses,
      monthlyCashFlow,
      annualCashFlow,
    },
    roi: {
      totalCashInvested,
      cashOnCashROI: round((annualCashFlow / totalCashInvested) * 100, 1),
      capRate: round(((rent * 12 - (totalMonthlyExpenses - monthlyMortgage) * 12) / property.price) * 100, 1),
      grossRentMultiplier: round(property.price / (rent * 12), 1),
    },
    taxSavings: {
      purchasePrice: property.price,
      depreciationDeduction: round((property.price * 0.8) / 27.5),
      taxSavings: round(((property.price * 0.8) / 27.5) * (params.taxRate / 100)),
      effectiveFirstYearReturn: 4.2,
    },
    rentalEstimate: {
      low: rent - 180,
      mid: rent,
      high: rent + 180,
      confidence: 'medium',
      comps: rentalComps,
    },
    marketStatistics,
    strategyComparison: {
      strategies: [
        {
          key: 'LTR',
          label: 'Long-Term',
          available: true,
          grossMonthly: rent,
          netRentalIncome: rent - monthlyVacancy - monthlyRepairs - monthlyCapex - monthlyManagement,
          netCashFlow: monthlyCashFlow,
          confidence: 'medium',
          source: 'algorithm',
        },
      ],
      bestKey: 'LTR',
      bestNetCashFlow: monthlyCashFlow,
    },
    breakEvenRent: totalMonthlyExpenses,
    comparables: [],
    verdict: {
      rating: monthlyCashFlow >= 0 ? 'strong' : 'marginal',
      score: monthlyCashFlow >= 0 ? 72 : 54,
      headline: 'Reference SaaS wrapper rendered a deterministic analyzer result.',
      reasons: [
        {
          code: 'reference-saas-wrapper',
          label: 'Rendered through injected SaaS adapters, not Asset Dashboard auth or shell.',
          impact: 'neutral',
        },
      ],
    },
    dataSources: {
      rental: 'algorithm',
      str: 'algorithm',
      mtr: 'algorithm',
      hoa: property.hoaFee ? 'zillow' : 'none',
      tax: 'actual',
      insurance: 'estimate',
    },
  };
}

function buildAnalysis(index: number, slug = `reference-saas-${index}`): PropertyAnalysis {
  const property = buildProperty(index);
  const params = buildParams(property);
  const rentalComps = buildRentalComps(index);
  const marketStatistics = buildMarketStatistics(index, params.rentOverride);
  return {
    id: index,
    slug,
    user_id: 1,
    zillow_url: property.zillowUrl ?? `https://example.test/reference-saas/${index}`,
    zpid: property.zpid,
    source_url: property.zillowUrl,
    source_type: 'address',
    property_data: property,
    analysis_params: params,
    analysis_results: buildResults(property, params, rentalComps, marketStatistics),
    rental_comps: rentalComps,
    is_shared: false,
    created_at: new Date(Date.UTC(2026, 0, index, 12, 0, 0)).toISOString(),
  };
}

function createStorageAdapter(): AnalyzerStorageAdapter {
  const storage = new Map<string, unknown>();
  return {
    get<T>(key: string): T | null {
      return storage.has(key) ? (storage.get(key) as T) : null;
    },
    set<T>(key: string, value: T) {
      storage.set(key, value);
    },
    remove(key: string) {
      storage.delete(key);
    },
  };
}

function createMockApi(): AnalyzerApiClient {
  const analyses = new Map<string, PropertyAnalysis>();
  const marketTrendsByZip = new Map<string, unknown>();
  const comparisons = new Map<number, SavedComparison>();
  let nextComparisonId = 1;
  let nextAnalysisId = 4;

  const storeAnalysis = (analysis: PropertyAnalysis) => {
    analyses.set(analysis.slug, analysis);
    const marketStatistics = analysis.analysis_results.marketStatistics;
    if (marketStatistics) {
      marketTrendsByZip.set(
        analysis.property_data.zip,
        buildMarketTrendResponse(analysis.property_data, marketStatistics),
      );
    }
    return analysis;
  };

  storeAnalysis(buildAnalysis(1, 'reference-saas-1'));
  storeAnalysis(buildAnalysis(2, 'reference-saas-2'));
  storeAnalysis(buildAnalysis(3, 'reference-saas-3'));

  const findAnalysis = (slug: string) => {
    const analysis = analyses.get(slug);
    if (!analysis) {
      throw new Error(`Reference SaaS fixture "${slug}" was not found.`);
    }
    return analysis;
  };

  return {
    async runAnalysis({ url }) {
      const slug = `reference-saas-${nextAnalysisId}`;
      const analysis = buildAnalysis(nextAnalysisId, slug);
      const stored = storeAnalysis({
        ...analysis,
        source_url: url,
        zillow_url: url,
      });
      nextAnalysisId += 1;
      return stored;
    },
    async getHistory({ page = 1, limit = 10 }) {
      const items = Array.from(analyses.values());
      const start = (page - 1) * limit;
      return { items: items.slice(start, start + limit), total: items.length, page, limit };
    },
    async getAnalysis(slug) {
      return findAnalysis(slug);
    },
    async deleteAnalysis(slug) {
      analyses.delete(slug);
    },
    async reAnalyze(slug) {
      return findAnalysis(slug);
    },
    async saveAdjustments() {
      return undefined;
    },
    async setShared(slug) {
      throw new Error(`Public sharing is disabled in the reference SaaS smoke harness for "${slug}".`);
    },
    async getSharedAnalysis(slug) {
      return findAnalysis(slug);
    },
    async saveComparison(name, propertySlugs) {
      const comparison: SavedComparison = {
        id: nextComparisonId,
        name,
        property_slugs: propertySlugs,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      comparisons.set(nextComparisonId, comparison);
      nextComparisonId += 1;
      return comparison;
    },
    async getSavedComparisons({ page = 1, limit = 10 }) {
      const items = Array.from(comparisons.values());
      const start = (page - 1) * limit;
      return { items: items.slice(start, start + limit), total: items.length, page, limit };
    },
    async getSavedComparison(id) {
      const comparison = comparisons.get(id);
      if (!comparison) throw new Error(`Reference SaaS comparison "${id}" was not found.`);
      return comparison;
    },
    async updateComparisonSlugs(id, propertySlugs) {
      const comparison = comparisons.get(id);
      if (!comparison) throw new Error(`Reference SaaS comparison "${id}" was not found.`);
      const updated = { ...comparison, property_slugs: propertySlugs, updated_at: new Date().toISOString() };
      comparisons.set(id, updated);
      return updated;
    },
    async deleteSavedComparison(id) {
      comparisons.delete(id);
    },
    async getComparisonSummary() {
      return {
        summary: 'AI comparison summaries are disabled in the reference SaaS smoke harness.',
        generatedAt: new Date().toISOString(),
      };
    },
    async getPropertyNarratives() {
      return [];
    },
    async searchForeclosures() {
      return { items: [] };
    },
    async getMarketTrends(postalCode) {
      return marketTrendsByZip.get(postalCode) ?? { data: [] };
    },
    async submitFeedback() {
      return { ok: true };
    },
  };
}

function ReferenceSaasWrapper() {
  const [route, setRoute] = useState<AnalyzerRoute>(() => routeFromLocation(window.location));
  const api = useMemo(() => createMockApi(), []);
  const storage = useMemo(() => createStorageAdapter(), []);

  const navigation = useMemo<AnalyzerNavigationAdapter>(() => ({
    currentUrl() {
      return new URL(window.location.href);
    },
    toUrl(nextRoute) {
      return routeToPath(nextRoute);
    },
    navigate(nextRoute, options) {
      const path = routeToPath(nextRoute);
      if (options?.replace) {
        window.history.replaceState(null, '', path);
      } else {
        window.history.pushState(null, '', path);
      }
      setRoute(nextRoute);
    },
    external(path) {
      return absolute(path);
    },
    navigateExternal(path, options) {
      const url = absolute(path);
      if (options?.replace) {
        window.location.replace(url);
        return;
      }
      window.location.href = url;
    },
  }), []);

  const props = useMemo<PropertyAnalyzerCoreProps>(() => ({
    basePath: BASE_PATH,
    initialRoute: route,
    adapters: {
      auth: {
        isLoading: false,
        async getSession() {
          return SAAS_SESSION;
        },
        async requireSession() {
          return SAAS_SESSION;
        },
        onUnauthorized(error) {
          throw error instanceof Error ? error : new Error('Reference SaaS session is required.');
        },
        signOut() {
          window.dispatchEvent(new CustomEvent('reference-saas:sign-out'));
        },
      },
      api,
      navigation,
      storage,
      shareUrls: {
        analysis(slug) {
          return absolute(routeToPath({ kind: 'analyze', slug }));
        },
        publicAnalysis(slug) {
          return absolute(routeToPath({ kind: 'shared', slug }));
        },
        privateComparison(propertySlugs) {
          return absolute(routeToPath({ kind: 'compare', propertySlugs }));
        },
      },
      events: {
        shareLinkCopied(url) {
          window.dispatchEvent(new CustomEvent('reference-saas:share-link-copied', { detail: { url } }));
        },
        exportStarted(kind) {
          window.dispatchEvent(new CustomEvent('reference-saas:export-started', { detail: { kind } }));
        },
        error(error) {
          window.dispatchEvent(new CustomEvent('reference-saas:error', { detail: error }));
        },
      },
    },
    features: {
      askWill: false,
      comparisons: false,
      savedComparisons: false,
      publicSharing: false,
      pdfExport: false,
      streetView: false,
      aiComparisonSummary: false,
      aiPropertyNarratives: false,
    },
    branding: {
      productName: 'Investor Lab Analyzer',
      platformName: 'Reference SaaS Platform',
      logoText: 'Investor Lab Analyzer',
      homeLabel: 'Reference SaaS home',
      themeClassName: 'reference-saas-analyzer',
    },
    shellSlots: {
      loadingFallback: <div className="reference-saas-smoke">Loading reference SaaS analyzer...</div>,
      footer: (
        <footer className="reference-saas-smoke">
          Reference SaaS smoke harness: no shared-auth, no dashboard shell, base path {BASE_PATH}.
        </footer>
      ),
      assistant: () => null,
      publicSharedBanner: <span>Reference SaaS public view fixture</span>,
    },
  }), [api, navigation, route, storage]);

  return <PropertyAnalyzerCore {...props} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReferenceSaasWrapper />
  </StrictMode>,
);
