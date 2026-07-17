import { StrictMode, useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
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
  type ComparableProperty,
  type FullAnalysisResult,
  type MarketStatistics,
  type MTREstimate,
  type PropertyData,
  type RentalComp,
  type SavedComparison,
  type STREstimate,
} from '@deal-platform/shared-types';
import '@deal-platform/property-analyzer-core/styles.css';
import './styles.css';

function normalizeBasePath(value: string | undefined): string {
  if (!value || value === '/') return '';
  return `/${value.replace(/^\/+|\/+$/g, '')}`;
}

const BASE_PATH = normalizeBasePath(import.meta.env.VITE_INVESTOR_LAB_BASE_PATH ?? '/investor-lab');
const APP_PATH = `${BASE_PATH}/app`;
const API_BASE_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3002' : '');
const USE_LOCAL_ANALYZER_FIXTURES =
  import.meta.env.DEV && import.meta.env.VITE_INVESTOR_LAB_USE_REAL_ANALYZER !== 'true';
const AUTH_STORAGE_KEY = 'investorLabAuth';
const THEME_STORAGE_KEY = 'investorLabTheme';
const PRODUCT_NAME = 'Cashflow or No?';
const BRAND_LOGO_SRC = `${import.meta.env.BASE_URL}cashflow-or-no-logo.png`;
const BRAND_GAUGE_SRC = `${import.meta.env.BASE_URL}cashflow-or-no-favicon.png`;

type InvestorLabTheme = 'light' | 'dark';

interface InvestorLabUser {
  id: number;
  email: string;
  name?: string | null;
  companyName?: string | null;
  investorFocus?: string | null;
}

interface InvestorLabAuthState {
  token: string;
  user: InvestorLabUser;
}

interface InvestorLabAuthForm {
  name?: string;
  email?: string;
  password?: string;
  companyName?: string;
  investorFocus?: string;
}

type WrapperPage = 'landing' | 'login' | 'register' | 'profile' | 'analyzer';

const INVESTOR_PERMISSIONS: AnalyzerSession['permissions'] = [
  'analysis:read',
  'analysis:write',
  'analysis:delete',
  'comparison:read',
];

function createAnalyzerSession(user: InvestorLabUser): AnalyzerSession {
  return {
    userId: String(user.id),
    email: user.email,
    displayName: user.name || user.email,
    tenantId: 'investor-lab',
    roles: ['member'],
    permissions: INVESTOR_PERMISSIONS,
  };
}

function readStoredAuth(): InvestorLabAuthState | null {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    return stored ? JSON.parse(stored) as InvestorLabAuthState : null;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

function storeAuth(auth: InvestorLabAuthState | null) {
  if (!auth) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
}

function readStoredTheme(): InvestorLabTheme {
  return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

function storeTheme(theme: InvestorLabTheme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function readJsonBody<T>(init: RequestInit): T {
  if (typeof init.body !== 'string') {
    throw new Error(`${PRODUCT_NAME} local fixture requests must send a JSON body.`);
  }
  return JSON.parse(init.body) as T;
}

function createLocalAuthState(form: InvestorLabAuthForm): InvestorLabAuthState {
  const email = form.email?.trim() || 'investor@example.test';
  return {
    token: 'local-investor-lab-fixture-token',
    user: {
      id: 1,
      email,
      name: form.name?.trim() || email.split('@')[0] || 'Investor',
      companyName: form.companyName?.trim() || null,
      investorFocus: form.investorFocus || INVESTOR_FOCUS_OPTIONS[0],
    },
  };
}

async function investorLabLocalAuthFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (path === '/api/investor-lab/auth/login' || path === '/api/investor-lab/auth/register') {
    return createLocalAuthState(readJsonBody<InvestorLabAuthForm>(init)) as T;
  }

  if (path === '/api/investor-lab/auth/me' && (init.method ?? 'GET').toUpperCase() === 'PATCH') {
    const stored = readStoredAuth();
    if (!stored) throw new Error(`${PRODUCT_NAME} account required.`);
    const form = readJsonBody<InvestorLabAuthForm>(init);
    return {
      user: {
        ...stored.user,
        name: form.name?.trim() || stored.user.name,
        companyName: form.companyName?.trim() || null,
        investorFocus: form.investorFocus || stored.user.investorFocus,
      },
    } as T;
  }

  throw new Error(`${PRODUCT_NAME} local fixture auth route "${path}" is not implemented.`);
}

function pageFromLocation(location: Location): WrapperPage {
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  const internalPath = BASE_PATH && pathname.startsWith(BASE_PATH)
    ? pathname.slice(BASE_PATH.length) || '/'
    : pathname;

  if (internalPath === '/login') return 'login';
  if (internalPath === '/register') return 'register';
  if (internalPath === '/profile') return 'profile';
  if (internalPath === '/' || internalPath === '') return 'landing';
  return 'analyzer';
}

function wrapperPath(page: Exclude<WrapperPage, 'analyzer'>): string {
  if (page === 'landing') return pathWithBase('/');
  return pathWithBase(`/${page}`);
}

function navigateWrapper(page: Exclude<WrapperPage, 'analyzer'>, replace = false) {
  const path = wrapperPath(page);
  if (replace) {
    window.history.replaceState(null, '', path);
  } else {
    window.history.pushState(null, '', path);
  }
}

async function investorLabAuthFetch<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  if (USE_LOCAL_ANALYZER_FIXTURES) {
    return investorLabLocalAuthFetch<T>(path, init);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    let message = `${PRODUCT_NAME} API ${response.status}`;
    try {
      const body = await response.json() as { error?: string };
      if (body.error) message = body.error;
    } catch { /* keep status message */ }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

const ANALYSIS_SCREENSHOT_SRC = '/investor-lab/rental-analysis-screenshot.jpg';

type LandingFeatureIcon = 'strategy' | 'cashflow' | 'comps' | 'market' | 'projection' | 'loan';

const LANDING_FEATURES = [
  {
    icon: 'strategy' as const,
    title: 'Rental Strategy Comparison',
    body: 'See long-term, mid-term, and short-term rental income side by side, so you know which strategy actually cash flows before you commit to a lease type.',
  },
  {
    icon: 'cashflow' as const,
    title: 'Full Cash Flow Breakdown',
    body: "Mortgage, property tax, insurance, HOA, utilities, management, and furnishing wear — broken out line by line, not buried in a single 'expenses' number.",
  },
  {
    icon: 'comps' as const,
    title: 'Comparable Properties & Rents',
    body: "Pull nearby active listings and rental comps automatically, so you can sanity-check price and rent against what's actually on the market right now.",
  },
  {
    icon: 'market' as const,
    title: 'Local Market Snapshot',
    body: "Median sold price, list price, days on market, and sale-to-list ratio for the property's zip code, updated with current market conditions.",
  },
  {
    icon: 'projection' as const,
    title: 'Long-Term Wealth Projection',
    body: 'Stress-test your assumptions on rent, price, and interest rate, then see a multi-year projection of equity, appreciation, and break-even timing.',
  },
  {
    icon: 'loan' as const,
    title: 'Built-In Loan Calculator',
    body: 'Adjust down payment, term, and rate to see monthly principal and interest update instantly, right alongside your cash flow numbers.',
  },
];

const INVESTOR_FOCUS_OPTIONS = [
  'Buy and hold rentals',
  'BRRRR',
  'Short-term rentals',
  'Fix and flip',
  'Wholesaling',
  'Private lending',
];

const EMPTY_AUTH_FORM = {
  name: '',
  email: '',
  password: '',
  companyName: '',
  investorFocus: INVESTOR_FOCUS_OPTIONS[0],
};

const EMPTY_PROFILE_FORM = {
  name: '',
  companyName: '',
  investorFocus: INVESTOR_FOCUS_OPTIONS[0],
};

function pathWithBase(path: string): string {
  if (!BASE_PATH) return path;
  return path === '/' ? `${BASE_PATH}/` : `${BASE_PATH}${path}`;
}

function routeFromLocation(location: Location): AnalyzerRoute {
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  const internalPath = pathname.startsWith(APP_PATH)
    ? pathname.slice(APP_PATH.length) || '/'
    : pathname;

  if (internalPath.startsWith('/analysis/')) {
    return { kind: 'analyze', slug: decodeURIComponent(internalPath.slice('/analysis/'.length)) };
  }
  if (internalPath === '/compare') {
    const props = new URLSearchParams(location.search).get('props');
    return { kind: 'compare', propertySlugs: props ? props.split(',').filter(Boolean) : undefined };
  }
  if (internalPath === '/history') {
    return { kind: 'history' };
  }
  if (internalPath.startsWith('/shared/')) {
    return { kind: 'shared', slug: decodeURIComponent(internalPath.slice('/shared/'.length)) };
  }
  return { kind: 'analyze' };
}

function routeToPath(route: AnalyzerRoute): string {
  switch (route.kind) {
    case 'history':
      return `${APP_PATH}/history`;
    case 'analyze':
      return route.kind === 'analyze' && route.slug
        ? `${APP_PATH}/analysis/${encodeURIComponent(route.slug)}`
        : `${APP_PATH}/`;
    case 'compare': {
      const props = route.propertySlugs?.filter(Boolean).map(encodeURIComponent).join(',');
      return props ? `${APP_PATH}/compare?props=${props}` : `${APP_PATH}/compare`;
    }
    case 'shared':
      return `${APP_PATH}/shared/${encodeURIComponent(route.slug)}`;
  }
  return `${APP_PATH}/`;
}

function absolute(path: string): string {
  const relative = path.startsWith('/') ? path : `/${path}`;
  return `${window.location.origin}${relative}`;
}

function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

interface ReferenceMarketProfile {
  city: string;
  state: string;
  zipBase: number;
  street: string;
  priceBase: number;
  rentBase: number;
  lat: number;
  lng: number;
  type: string;
}

interface SourcePropertyDetails {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

const MARKET_PROFILES: ReferenceMarketProfile[] = [
  { city: 'Tampa', state: 'FL', zipBase: 33602, street: 'Harbor Pine Way', priceBase: 338000, rentBase: 2650, lat: 27.9506, lng: -82.4572, type: 'Single Family' },
  { city: 'Charlotte', state: 'NC', zipBase: 28205, street: 'Queen City Row', priceBase: 371000, rentBase: 2550, lat: 35.2271, lng: -80.8431, type: 'Townhouse' },
  { city: 'Atlanta', state: 'GA', zipBase: 30316, street: 'Eastside Beltline Dr', priceBase: 412000, rentBase: 2875, lat: 33.749, lng: -84.388, type: 'Single Family' },
  { city: 'Phoenix', state: 'AZ', zipBase: 85018, street: 'Camelback Terrace', priceBase: 446000, rentBase: 2925, lat: 33.4484, lng: -112.074, type: 'Condo' },
  { city: 'Columbus', state: 'OH', zipBase: 43206, street: 'German Village Ln', priceBase: 289000, rentBase: 2180, lat: 39.9612, lng: -82.9988, type: 'Duplex' },
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(i);
  }
  return Math.abs(hash);
}

function normalizeAnalysisInput(value: string): string {
  return value.trim().replace(/\/+$/, '').toLowerCase();
}

function seedFromSource(value: string): number {
  return 10000 + (hashString(normalizeAnalysisInput(value)) % 900000);
}

function sourceCode(value: string | undefined, fallback: number): string {
  if (!value) return String(fallback).padStart(4, '0');
  const match = normalizeAnalysisInput(value).match(/(?:zpid|home|property)?[\W_]*(\d{5,})/i);
  if (match) return match[1].slice(-5);
  return String(seedFromSource(value)).slice(-5);
}

function fixtureVariant(index: number): number {
  return 1 + (index % 12);
}

function titleCaseSlugPart(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function extractSourcePropertyDetails(sourceUrl: string | undefined): SourcePropertyDetails {
  if (!sourceUrl) return {};
  let decoded = sourceUrl;
  try {
    const parsed = new URL(sourceUrl);
    const homeDetails = parsed.pathname.match(/\/homedetails\/([^/]+)/i);
    if (homeDetails) decoded = decodeURIComponent(homeDetails[1]);
  } catch {
    const homeDetails = sourceUrl.match(/\/homedetails\/([^/?#]+)/i);
    if (homeDetails) decoded = decodeURIComponent(homeDetails[1]);
  }

  const normalized = decoded.toLowerCase();
  const zipMatch = normalized.match(/\b(\d{5})(?:-\d{4})?\b/);
  const stateZipMatch = normalized.match(/-([a-z]{2})-(\d{5})(?:-|_|$)/);
  const matchedProfile = MARKET_PROFILES.find(profile => normalized.includes(profile.city.toLowerCase().replace(/\s+/g, '-')));

  const zip = zipMatch?.[1];
  const state = stateZipMatch?.[1]?.toUpperCase() ?? matchedProfile?.state;
  const city = matchedProfile?.city;
  let address: string | undefined;

  if (city) {
    const citySlug = city.toLowerCase().replace(/\s+/g, '-');
    const cityIndex = normalized.indexOf(`-${citySlug}-`);
    if (cityIndex > 0) address = titleCaseSlugPart(normalized.slice(0, cityIndex));
  }

  if (!address && stateZipMatch?.index && stateZipMatch.index > 0) {
    address = titleCaseSlugPart(normalized.slice(0, stateZipMatch.index));
  }

  return { address, city, state, zip };
}

function profileIndexFromSource(sourceUrl: string | undefined, fallback: number): number {
  if (!sourceUrl) return fallback % MARKET_PROFILES.length;
  const normalized = normalizeAnalysisInput(sourceUrl);
  const zipMatch = normalized.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipMatch) {
    const zip = Number.parseInt(zipMatch[1], 10);
    const zipIndex = MARKET_PROFILES.findIndex(profile => Math.abs(zip - profile.zipBase) < 100);
    if (zipIndex >= 0) return zipIndex;
  }
  const cityIndex = MARKET_PROFILES.findIndex(profile => normalized.includes(profile.city.toLowerCase()));
  if (cityIndex >= 0) return cityIndex;
  const stateIndex = MARKET_PROFILES.findIndex(profile => normalized.includes(`-${profile.state.toLowerCase()}-`));
  if (stateIndex >= 0) return stateIndex;
  return fallback % MARKET_PROFILES.length;
}

function buildProperty(index: number, sourceUrl?: string): PropertyData {
  const profile = MARKET_PROFILES[profileIndexFromSource(sourceUrl, index)];
  const sourceDetails = extractSourcePropertyDetails(sourceUrl);
  const variation = index % 17;
  const bedrooms = 2 + (index % 4);
  const bathrooms = bedrooms >= 4 ? 3 : 2;
  const sqft = 1280 + (index % 9) * 115 + bedrooms * 120;
  const price = profile.priceBase + variation * 8500 + bedrooms * 12000;
  const rent = profile.rentBase + variation * 45 + (bedrooms - 3) * 210;
  const sourceSuffix = sourceCode(sourceUrl, index);
  const streetNumber = 100 + (index % 8900);
  const zip = String(profile.zipBase + (index % 4));

  return {
    zpid: `reference-saas-${index}`,
    address: `${sourceDetails.address ?? `${streetNumber} ${profile.street}`} #${sourceSuffix}`,
    city: sourceDetails.city ?? profile.city,
    state: sourceDetails.state ?? profile.state,
    zip: sourceDetails.zip ?? zip,
    price,
    zestimate: price + 7000 + variation * 900,
    rentZestimate: rent,
    bedrooms,
    bathrooms,
    sqft,
    lotSize: 4200 + (index % 6) * 650,
    yearBuilt: 1986 + (index % 34),
    propertyType: profile.type,
    description: `${PRODUCT_NAME} fixture generated from source ${sourceSuffix} through injected mock adapters.`,
    photos: [],
    taxHistory: [{ year: 2025, amount: round(price * 0.012) }],
    priceHistory: [
      { date: '2024-03-01', price: price - 14000 - variation * 700, event: 'Sold' },
      { date: '2026-02-15', price, event: 'Listed for sale' },
    ],
    hoaFee: profile.type === 'Condo' || profile.type === 'Townhouse' ? 145 + (index % 4) * 25 : 0,
    latitude: profile.lat + (index % 10) * 0.004,
    longitude: profile.lng - (index % 10) * 0.004,
    zillowUrl: sourceUrl ?? `https://example.test/reference-saas/${index}`,
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

function buildComparables(property: PropertyData, index: number): ComparableProperty[] {
  return [
    {
      zpid: `reference-comp-${index}-1`,
      address: `${720 + index} Market Comp Ln`,
      city: property.city,
      state: property.state,
      zip: property.zip,
      price: property.price + 18000,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      sqft: property.sqft + 90,
      yearBuilt: (property.yearBuilt ?? 2005) - 2,
      homeStatus: 'FOR_SALE',
      homeType: property.propertyType,
      estimatedRent: (property.rentZestimate ?? 2400) + 120,
      pricePerSqft: round((property.price + 18000) / (property.sqft + 90)),
      rentPerSqft: round(((property.rentZestimate ?? 2400) + 120) / (property.sqft + 90), 2),
      rentConfidence: 'medium',
      rentSource: 'market-calibrated',
    },
    {
      zpid: `reference-comp-${index}-2`,
      address: `${840 + index} Rental Signal Ct`,
      city: property.city,
      state: property.state,
      zip: property.zip,
      price: property.price - 12000,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      sqft: property.sqft - 70,
      yearBuilt: (property.yearBuilt ?? 2005) + 1,
      homeStatus: 'FOR_SALE',
      homeType: property.propertyType,
      estimatedRent: (property.rentZestimate ?? 2400) - 85,
      pricePerSqft: round((property.price - 12000) / (property.sqft - 70)),
      rentPerSqft: round(((property.rentZestimate ?? 2400) - 85) / (property.sqft - 70), 2),
      rentConfidence: 'medium',
      rentSource: 'market-calibrated',
    },
  ];
}

function buildMarketStatistics(index: number): MarketStatistics {
  return {
    medianRent: 2525 + index * 110,
    averageRent: 2580 + index * 115,
    rentGrowthPct: round(3.1 + index * 0.2, 1),
    totalListings: 34 + index * 4,
    avgDaysOnMarket: Math.max(16, 29 - index),
    rentTrend: 'rising',
  };
}

function buildMarketTrendRows(postalCode: string) {
  const suffix = Number.parseInt(postalCode.slice(-2), 10);
  const index = Number.isFinite(suffix) && suffix > 0 ? suffix : 1;
  const stats = buildMarketStatistics(index);
  return {
    data: [
      { displayName: 'Median Rent', score: `$${stats.medianRent.toLocaleString()}`, trend: 'up' },
      { displayName: 'Rent Growth', score: `${stats.rentGrowthPct.toFixed(1)}% YoY`, trend: 'up' },
      { displayName: 'Active Listings', score: stats.totalListings.toLocaleString(), trend: 'flat' },
      { displayName: 'Avg Days on Market', score: `${stats.avgDaysOnMarket} days`, trend: 'down' },
    ],
  };
}

function buildStrEstimate(index: number): STREstimate {
  const nightlyRate = 158 + index * 7;
  const occupancyRate = 0.61 + Math.min(index, 5) * 0.01;
  const grossMonthlyRevenue = round(nightlyRate * 30 * occupancyRate);
  const cleaningCosts = round(grossMonthlyRevenue * 0.09);
  const platformFees = round(grossMonthlyRevenue * 0.03);
  const netMonthlyRevenue = round(grossMonthlyRevenue - cleaningCosts - platformFees - 375);
  const monthMultipliers = [0.86, 0.91, 1.08, 1.14, 1.06, 0.96, 0.9, 0.88, 0.97, 1.05, 1.12, 1.07];
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return {
    nightlyRate,
    occupancyRate,
    grossMonthlyRevenue,
    cleaningCosts,
    platformFees,
    netMonthlyRevenue,
    confidence: 'medium',
    source: 'algorithm',
    seasonality: monthLabels.map((month, monthIndex) => ({
      month,
      revenue: round(grossMonthlyRevenue * monthMultipliers[monthIndex]),
      occupancy: Math.min(0.88, round(occupancyRate * monthMultipliers[monthIndex], 2)),
    })),
    revenueRange: {
      low: round(grossMonthlyRevenue * 0.82),
      mid: grossMonthlyRevenue,
      high: round(grossMonthlyRevenue * 1.18),
    },
    marketContext: {
      activeListings: 118 + index * 9,
      avgRating: 4.72,
      supplyGrowth: 0.06,
    },
  };
}

function buildMtrEstimate(property: PropertyData, rent: number, index: number): MTREstimate {
  const furnishedPremium = 1.34;
  const monthlyRate = round(rent * furnishedPremium);
  const occupancyRate = 0.87;
  const grossMonthlyRevenue = round(monthlyRate * occupancyRate);
  const utilityCosts = 235;
  const turnoverCosts = 110;
  const platformFees = round(grossMonthlyRevenue * 0.02);
  const managementCosts = round(grossMonthlyRevenue * 0.08);
  const totalFurnishingCost = property.bedrooms * 2400 + 5200;
  const netMonthlyRevenue = round(grossMonthlyRevenue - utilityCosts - turnoverCosts - platformFees - managementCosts);
  const monthMultipliers = [0.96, 0.98, 1.03, 1.06, 1.05, 1.01, 0.99, 0.97, 1.0, 1.04, 1.06, 1.02];
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return {
    monthlyRate,
    furnishedPremium,
    occupancyRate,
    avgStayMonths: 3.1,
    turnoversPerYear: 4,
    grossMonthlyRevenue,
    utilityCosts,
    turnoverCosts,
    platformFees,
    managementCosts,
    netMonthlyRevenue,
    furnishingCosts: {
      perBedroomCost: 2400,
      commonAreaCost: 5200,
      totalCost: totalFurnishingCost,
      amortizedMonthly: round(totalFurnishingCost / 60),
      usefulLifeYears: 5,
      quality: 'standard',
    },
    demandFactors: {
      bedroomScore: 84,
      propertyTypeScore: 88,
      overallScore: 86,
      nearbyInstitutions: [
        { name: 'Regional Medical Center', emoji: '🏥', miles: 2.4 },
        { name: 'University Campus', emoji: '🎓', miles: 4.8 },
        { name: 'Business District', emoji: '🏢', miles: 5.6 },
      ],
    },
    confidence: 'medium',
    source: 'algorithm',
    seasonality: monthLabels.map((month, monthIndex) => ({
      month,
      revenue: round(grossMonthlyRevenue * monthMultipliers[monthIndex]),
      occupancy: Math.min(0.95, round(occupancyRate * monthMultipliers[monthIndex], 2)),
    })),
    revenueRange: {
      low: round(grossMonthlyRevenue * 0.9),
      mid: grossMonthlyRevenue,
      high: round(grossMonthlyRevenue * 1.12),
    },
    marketComps: {
      radiusMiles: 6,
      sampleSize: 7,
      totalListings: 24 + index,
      comps: [
        { bedrooms: property.bedrooms, bathrooms: property.bathrooms, propertyType: property.propertyType ?? null, monthlyRate: monthlyRate + 140 },
        { bedrooms: property.bedrooms, bathrooms: property.bathrooms, propertyType: 'Townhouse', monthlyRate: monthlyRate - 80 },
        { bedrooms: property.bedrooms + 1, bathrooms: property.bathrooms, propertyType: property.propertyType ?? null, monthlyRate: monthlyRate + 260 },
      ],
    },
  };
}

function buildResults(property: PropertyData, params: AnalysisParams, rentalComps: RentalComp[], index: number): FullAnalysisResult {
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
  const mtrEstimate = buildMtrEstimate(property, rent, index);
  const strEstimate = buildStrEstimate(index);
  const carryingCosts = monthlyMortgage + monthlyTax + monthlyInsurance + params.monthlyHoa;

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
    mtrEstimate,
    strEstimate,
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
        {
          key: 'MTR',
          label: 'Mid-Term',
          available: true,
          grossMonthly: mtrEstimate.grossMonthlyRevenue,
          netRentalIncome: mtrEstimate.netMonthlyRevenue,
          netCashFlow: round(mtrEstimate.netMonthlyRevenue - carryingCosts),
          confidence: mtrEstimate.confidence,
          source: mtrEstimate.source,
        },
        {
          key: 'STR',
          label: 'Short-Term',
          available: true,
          grossMonthly: strEstimate.grossMonthlyRevenue,
          netRentalIncome: strEstimate.netMonthlyRevenue,
          netCashFlow: round(strEstimate.netMonthlyRevenue - carryingCosts),
          confidence: strEstimate.confidence,
          source: strEstimate.source,
        },
      ],
      bestKey: 'MTR',
      bestNetCashFlow: round(mtrEstimate.netMonthlyRevenue - carryingCosts),
    },
    breakEvenRent: totalMonthlyExpenses,
    comparables: buildComparables(property, index),
    marketStatistics: buildMarketStatistics(index),
    verdict: {
      rating: monthlyCashFlow >= 0 ? 'strong' : 'marginal',
      score: monthlyCashFlow >= 0 ? 72 : 54,
      headline: `${PRODUCT_NAME} rendered a deterministic analyzer result.`,
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

function buildAnalysis(index: number, slug = `reference-saas-${index}`, sourceUrl?: string, id = index): PropertyAnalysis {
  const property = buildProperty(index, sourceUrl);
  const params = buildParams(property);
  const variant = fixtureVariant(index);
  const rentalComps = buildRentalComps(variant);
  return {
    id,
    slug,
    user_id: 1,
    zillow_url: sourceUrl ?? property.zillowUrl ?? `https://example.test/reference-saas/${index}`,
    zpid: property.zpid,
    source_url: sourceUrl ?? property.zillowUrl,
    source_type: 'address',
    property_data: property,
    analysis_params: params,
    analysis_results: buildResults(property, params, rentalComps, variant),
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
  const analyses = new Map<string, PropertyAnalysis>([
    ['reference-saas-1', buildAnalysis(1, 'reference-saas-1')],
    ['reference-saas-2', buildAnalysis(2, 'reference-saas-2')],
  ]);
  const analysisBySource = new Map<string, PropertyAnalysis>();
  const comparisons = new Map<number, SavedComparison>();
  let nextComparisonId = 1;
  let nextAnalysisId = 3;

  const findAnalysis = (slug: string) => {
    const analysis = analyses.get(slug);
    if (!analysis) {
      throw new Error(`${PRODUCT_NAME} fixture "${slug}" was not found.`);
    }
    return analysis;
  };

  return {
    async runAnalysis({ url }) {
      const sourceKey = normalizeAnalysisInput(url);
      const existing = analysisBySource.get(sourceKey);
      if (existing) return existing;

      const seed = seedFromSource(url);
      const slug = `reference-saas-${seed}`;
      const analysis = buildAnalysis(seed, slug, url, nextAnalysisId);
      analyses.set(slug, analysis);
      analysisBySource.set(sourceKey, analysis);
      nextAnalysisId += 1;
      return analysis;
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
      if (!comparison) throw new Error(`${PRODUCT_NAME} comparison "${id}" was not found.`);
      return comparison;
    },
    async updateComparisonSlugs(id, propertySlugs) {
      const comparison = comparisons.get(id);
      if (!comparison) throw new Error(`${PRODUCT_NAME} comparison "${id}" was not found.`);
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
      return buildMarketTrendRows(postalCode);
    },
    async submitFeedback() {
      return { ok: true };
    },
  };
}

async function investorLabFetch<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    let message = `${PRODUCT_NAME} API ${response.status}`;
    try {
      const body = await response.json() as { error?: string };
      if (body.error) message = body.error;
    } catch { /* keep status message */ }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function createInvestorLabApi(token: string): AnalyzerApiClient {
  const fallback = createMockApi();

  if (USE_LOCAL_ANALYZER_FIXTURES) {
    return fallback;
  }

  return {
    ...fallback,
    runAnalysis(input) {
      return investorLabFetch<PropertyAnalysis>('/api/investor-lab/analyzer/run', token, {
        method: 'POST',
        body: JSON.stringify({ url: input.url, params: input.params }),
      });
    },
    async getHistory({ page = 1, limit = 10 }) {
      const response = await investorLabFetch<{ analyses: PropertyAnalysis[]; total: number; page: number; limit: number }>(
        `/api/investor-lab/analyzer/history?page=${page}&limit=${limit}`,
        token,
      );
      return { items: response.analyses, total: response.total, page: response.page, limit: response.limit };
    },
    async getAnalysis(slug) {
      const response = await investorLabFetch<{ analysis: PropertyAnalysis }>(
        `/api/investor-lab/analyzer/history/${encodeURIComponent(slug)}`,
        token,
      );
      return response.analysis;
    },
    async deleteAnalysis(slug) {
      await investorLabFetch<{ success: boolean }>(`/api/investor-lab/analyzer/history/${encodeURIComponent(slug)}`, token, {
        method: 'DELETE',
      });
    },
    reAnalyze(slug, params) {
      return investorLabFetch<PropertyAnalysis>(`/api/investor-lab/analyzer/re-analyze/${encodeURIComponent(slug)}`, token, {
        method: 'POST',
        body: JSON.stringify({ params }),
      });
    },
    async saveAdjustments(slug, payload) {
      await investorLabFetch<{ success: boolean }>(`/api/investor-lab/analyzer/history/${encodeURIComponent(slug)}/overrides`, token, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    searchForeclosures(params) {
      return investorLabFetch<unknown>('/api/investor-lab/xome/search', token, {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },
    getMarketTrends(postalCode) {
      return investorLabFetch<unknown>(
        `/api/investor-lab/xome/market-trends?postalCode=${encodeURIComponent(postalCode)}`,
        token,
      );
    },
  };
}

function AnalysisScreenshot({ src, alt, caption }: { src?: string; alt: string; caption: string }) {
  return (
    <figure className="investor-analysis-shot">
      <div className="investor-analysis-shot__frame">
        {src ? (
          <img src={src} alt={alt} />
        ) : (
          <div className="investor-analysis-shot__placeholder" role="img" aria-label={alt}>
            <span>Analysis screenshot</span>
            <strong>Deal score, tax savings, and demand indicators</strong>
          </div>
        )}
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function FeatureIcon({ icon }: { icon: LandingFeatureIcon }) {
  const commonProps = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (icon) {
    case 'strategy':
      return (
        <svg {...commonProps}>
          <path d="M4 6h16" />
          <path d="M7 6v12" />
          <path d="M17 6v12" />
          <path d="M4 18h16" />
          <path d="M10 12h4" />
        </svg>
      );
    case 'cashflow':
      return (
        <svg {...commonProps}>
          <path d="M12 3v18" />
          <path d="M17 7.5c0-1.7-1.9-2.7-5-2.7s-5 1-5 2.7 1.8 2.4 5 2.9 5 1.2 5 3.1-1.9 2.7-5 2.7-5-1-5-2.7" />
        </svg>
      );
    case 'comps':
      return (
        <svg {...commonProps}>
          <path d="M5 9l7-5 7 5" />
          <path d="M7 10v9h10v-9" />
          <path d="M10 19v-5h4v5" />
          <path d="M4 20h16" />
        </svg>
      );
    case 'market':
      return (
        <svg {...commonProps}>
          <path d="M4 19h16" />
          <path d="M7 16v-5" />
          <path d="M12 16V7" />
          <path d="M17 16v-8" />
          <path d="M6 8l4-3 4 2 4-4" />
        </svg>
      );
    case 'projection':
      return (
        <svg {...commonProps}>
          <path d="M4 17l5-5 3 3 8-8" />
          <path d="M15 7h5v5" />
          <path d="M4 21h16" />
        </svg>
      );
    case 'loan':
      return (
        <svg {...commonProps}>
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <path d="M8 8h8" />
          <path d="M8 12h2" />
          <path d="M12 12h2" />
          <path d="M16 12h.01" />
          <path d="M8 16h2" />
          <path d="M12 16h4" />
        </svg>
      );
  }
}

function LandingPage({
  onNavigate,
}: {
  onNavigate: (page: Exclude<WrapperPage, 'analyzer'>) => void;
}) {
  return (
    <main className="investor-page investor-landing">
      <section className="investor-hero">
        <div>
          <img className="investor-brand-logo investor-brand-logo--hero" src={BRAND_LOGO_SRC} alt={`${PRODUCT_NAME} logo`} />
          <p className="investor-eyebrow">Rental deal analysis, instantly scored</p>
          <h1 className="investor-hero__headline">
            <span>Get the verdict on any rental property in seconds.</span>
          </h1>
          <p className="investor-hero__copy">
            Run the numbers a serious investor would run — rent estimates, cash flow, comps, and financing — before you ever make an offer.
          </p>
          <div className="investor-hero__actions">
            <button className="investor-button" onClick={() => onNavigate('register')}>Create account</button>
            <button className="investor-button investor-button--secondary" onClick={() => onNavigate('login')}>Sign in</button>
          </div>
        </div>
        <aside className="investor-hero__card investor-hero-verdict" aria-label="Sample Cashflow or No? deal verdict">
          <div className="investor-hero-verdict__meta">
            <span>Sample property score</span>
            <p>Single-family rental • Harrison Township, MI</p>
          </div>
          <div className="investor-hero-verdict__header">
            <div className="investor-hero-verdict__wheel" aria-hidden="true">
              <span>82</span>
            </div>
            <div>
              <strong>Strong Deal</strong>
              <span>Deal score 82/100</span>
            </div>
          </div>
          <p className="investor-hero-verdict__summary">
            Strong deal as a short-term rental — $420/mo cash flow and a 9.2% cash-on-cash return.
          </p>
          <ul className="investor-hero-verdict__list">
            <li><span aria-hidden="true">✓</span> Best as a short-term rental</li>
            <li><span aria-hidden="true">✓</span> Cash-on-cash return clears 8% target</li>
            <li><span aria-hidden="true">✓</span> Healthy cap rate and demand score</li>
          </ul>
          <div className="investor-hero-verdict__strategies" aria-label="Sample rental strategy comparison">
            <div>
              <span>Short-term</span>
              <strong>$420/mo</strong>
              <i style={{ '--bar-width': '100%' } as CSSProperties} />
            </div>
            <div>
              <span>Mid-term</span>
              <strong>$185/mo</strong>
              <i style={{ '--bar-width': '58%' } as CSSProperties} />
            </div>
            <div>
              <span>Long-term</span>
              <strong>-$115/mo</strong>
              <i style={{ '--bar-width': '24%' } as CSSProperties} />
            </div>
          </div>
          <div className="investor-hero-verdict__metrics" aria-label="Sample property score metrics">
            <span><strong>$420/mo</strong> Cash flow</span>
            <span><strong>8.4%</strong> Cap rate</span>
          </div>
        </aside>
      </section>

      <section className="investor-showcase" aria-labelledby="investor-showcase-title">
        <header className="investor-showcase__header">
          <p className="investor-eyebrow">REAL ANALYSIS, NOT GUESSWORK</p>
          <h2 id="investor-showcase-title">Here's what 'Cashflow or No?' looks like on an actual property.</h2>
        </header>
        <div className="investor-showcase__body">
          <AnalysisScreenshot
            src={ANALYSIS_SCREENSHOT_SRC}
            alt="Cashflow or No? property analysis dashboard showing deal score, tax savings, and demand indicators."
            caption="Real output from Cashflow or No?, showing the rental strategy comparison, demand indicators, and market snapshot for zip code 48047."
          />
          <div className="investor-showcase__content">
          <article className="investor-showcase-panel investor-showcase-panel--tax" aria-labelledby="investor-tax-title">
            <p className="investor-showcase-panel__eyebrow">TAX SAVINGS, BUILT IN</p>
            <h3 id="investor-tax-title">See the tax break most calculators miss.</h3>
            <p>
              Cashflow or No? estimates first-year cost segregation savings automatically — breaking depreciation into building value and fast-depreciating furniture and appliances, then showing your effective first-year return once tax savings are factored in alongside cash flow.
            </p>
            <div className="investor-showcase-panel__stats" aria-label="Estimated cost segregation savings">
              <span className="investor-showcase-stat investor-showcase-stat--strong"><strong>$13,983</strong> Est. Year 1 tax savings</span>
              <span className="investor-showcase-stat investor-showcase-stat--strong"><strong>20.4%</strong> Effective first-year return (cash flow + tax savings)</span>
            </div>
          </article>
          <article className="investor-showcase-panel investor-showcase-panel--demand" aria-labelledby="investor-demand-title">
            <p className="investor-showcase-panel__eyebrow">IS THE DEMAND REAL?</p>
            <h3 id="investor-demand-title">Rental Demand Indicators</h3>
            <p>Every deal gets checked against independent demand signals, not just a single score.</p>
            <div className="investor-demand-badges" aria-label="Rental demand indicators">
              <span className="investor-demand-badge investor-demand-badge--good"><strong>8.2x</strong> Price-to-rent <em>Good</em></span>
              <span className="investor-demand-badge investor-demand-badge--strong"><strong>12.3%</strong> Gross yield <em>Good</em></span>
              <span className="investor-demand-badge investor-demand-badge--good"><strong>+7.8%</strong> Rent vs. area avg <em>Good</em></span>
              <span className="investor-demand-badge investor-demand-badge--fair"><strong>$1.02</strong> Rent per sq ft <em>Fair</em></span>
            </div>
          </article>
          </div>
        </div>
      </section>

      <section className="investor-feature-section" aria-labelledby="investor-features-title">
        <h2 id="investor-features-title">One address in. Every angle covered.</h2>
        <div className="investor-feature-grid">
          {LANDING_FEATURES.map(feature => (
            <article key={feature.title} className="investor-feature-card">
              <span className="investor-feature-card__icon"><FeatureIcon icon={feature.icon} /></span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="investor-credibility-strip" aria-label="Cashflow or No? data sources">
        <div className="investor-credibility-strip__inner">
          <span className="investor-credibility-strip__label">Real data engine</span>
          <p>Powered by live market comps, rental data, and cash flow modeling — built for people who want the real numbers, not a hunch.</p>
          <div className="investor-credibility-strip__sources" aria-label="Data sources included">
            <span>Market comps</span>
            <span>Rental data</span>
            <span>Cash flow model</span>
          </div>
        </div>
      </section>

      <section className="investor-closing-cta" aria-labelledby="investor-closing-title">
        <p className="investor-eyebrow">Cashflow or No?</p>
        <h2 id="investor-closing-title">Stop guessing. Start scoring your deals.</h2>
        <p>Create your profile and run your first property analysis in minutes.</p>
        <div className="investor-hero__actions investor-closing-cta__actions">
          <button className="investor-button" onClick={() => onNavigate('register')}>Create account</button>
          <button className="investor-button investor-button--secondary" onClick={() => onNavigate('login')}>Sign in</button>
        </div>
      </section>
    </main>
  );
}

function AuthPage({
  mode,
  onSubmit,
  onNavigate,
}: {
  mode: 'login' | 'register';
  onSubmit: (mode: 'login' | 'register', form: typeof EMPTY_AUTH_FORM) => Promise<void>;
  onNavigate: (page: Exclude<WrapperPage, 'analyzer'>) => void;
}) {
  const [form, setForm] = useState(EMPTY_AUTH_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegistering = mode === 'register';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(mode, form);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : `${PRODUCT_NAME} sign-in failed.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="investor-page investor-auth-page">
      <form className="investor-auth-card" onSubmit={handleSubmit}>
        <img className="investor-brand-logo investor-brand-logo--card" src={BRAND_LOGO_SRC} alt={`${PRODUCT_NAME} logo`} />
        <p className="investor-eyebrow">{PRODUCT_NAME} account</p>
        <h1>{isRegistering ? 'Create your investor account' : 'Welcome back'}</h1>
        <p className="investor-muted">
          {isRegistering
            ? 'This account is separate from other workspaces and keeps its own profile.'
            : `Use your ${PRODUCT_NAME} credentials for this investor workspace.`}
        </p>

        {isRegistering && (
          <label>
            Name
            <input
              value={form.name}
              onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
              autoComplete="name"
            />
          </label>
        )}

        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={event => setForm(current => ({ ...current, email: event.target.value }))}
            autoComplete="email"
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={event => setForm(current => ({ ...current, password: event.target.value }))}
            autoComplete={isRegistering ? 'new-password' : 'current-password'}
            minLength={8}
            required
          />
        </label>

        {isRegistering && (
          <>
            <label>
              Company
              <input
                value={form.companyName}
                onChange={event => setForm(current => ({ ...current, companyName: event.target.value }))}
                autoComplete="organization"
              />
            </label>
            <label>
              Investor focus
              <select
                value={form.investorFocus}
                onChange={event => setForm(current => ({ ...current, investorFocus: event.target.value }))}
              >
                {INVESTOR_FOCUS_OPTIONS.map(option => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          </>
        )}

        {error && <div className="investor-error" role="alert">{error}</div>}

        <button className="investor-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Please wait...' : isRegistering ? 'Create account' : 'Sign in'}
        </button>

        <button
          className="investor-link-button"
          type="button"
          onClick={() => onNavigate(isRegistering ? 'login' : 'register')}
        >
          {isRegistering ? `Already have a ${PRODUCT_NAME} account?` : `Need a ${PRODUCT_NAME} account?`}
        </button>
      </form>
    </main>
  );
}

function ProfilePage({
  auth,
  onSave,
  onSignOut,
}: {
  auth: InvestorLabAuthState;
  onSave: (form: typeof EMPTY_PROFILE_FORM) => Promise<void>;
  onSignOut: () => void;
}) {
  const [form, setForm] = useState({
    name: auth.user.name || '',
    companyName: auth.user.companyName || '',
    investorFocus: auth.user.investorFocus || INVESTOR_FOCUS_OPTIONS[0],
  });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      await onSave(form);
      setMessage('Profile updated.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to update profile.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="investor-page investor-auth-page">
      <form className="investor-auth-card" onSubmit={handleSubmit}>
        <img className="investor-brand-logo investor-brand-logo--card" src={BRAND_LOGO_SRC} alt={`${PRODUCT_NAME} logo`} />
        <p className="investor-eyebrow">Investor profile</p>
        <h1>{auth.user.name || auth.user.email}</h1>
        <p className="investor-muted">This profile is only used for {PRODUCT_NAME}.</p>

        <label>
          Email
          <input value={auth.user.email} disabled />
        </label>
        <label>
          Name
          <input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} />
        </label>
        <label>
          Company
          <input
            value={form.companyName}
            onChange={event => setForm(current => ({ ...current, companyName: event.target.value }))}
          />
        </label>
        <label>
          Investor focus
          <select
            value={form.investorFocus}
            onChange={event => setForm(current => ({ ...current, investorFocus: event.target.value }))}
          >
            {INVESTOR_FOCUS_OPTIONS.map(option => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>

        {error && <div className="investor-error" role="alert">{error}</div>}
        {message && <div className="investor-success" role="status">{message}</div>}

        <button className="investor-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save profile'}
        </button>
        <button className="investor-link-button" type="button" onClick={onSignOut}>Sign out</button>
      </form>
    </main>
  );
}

function ThemeToggle({ theme, onChange }: { theme: InvestorLabTheme; onChange: (theme: InvestorLabTheme) => void }) {
  return (
    <div className="investor-theme-toggle" role="group" aria-label="Theme preference">
      <button
        type="button"
        className={`investor-theme-toggle__option${theme === 'light' ? ' investor-theme-toggle__option--active' : ''}`}
        onClick={() => onChange('light')}
        aria-pressed={theme === 'light'}
      >
        Light
      </button>
      <button
        type="button"
        className={`investor-theme-toggle__option${theme === 'dark' ? ' investor-theme-toggle__option--active' : ''}`}
        onClick={() => onChange('dark')}
        aria-pressed={theme === 'dark'}
      >
        Dark
      </button>
    </div>
  );
}

function ReferenceSaasWrapper() {
  const [page, setPage] = useState<WrapperPage>(() => pageFromLocation(window.location));
  const [auth, setAuth] = useState<InvestorLabAuthState | null>(() => readStoredAuth());
  const [route, setRoute] = useState<AnalyzerRoute>(() => routeFromLocation(window.location));
  const [theme, setTheme] = useState<InvestorLabTheme>(() => readStoredTheme());
  const activeTheme = page === 'analyzer' ? theme : 'dark';
  const api = useMemo(() => createInvestorLabApi(auth?.token ?? ''), [auth?.token]);
  const storage = useMemo(() => createStorageAdapter(), []);

  useEffect(() => {
    document.body.dataset.cashflowTheme = activeTheme;
  }, [activeTheme]);

  useEffect(() => {
    storeTheme(theme);
  }, [theme]);

  useEffect(() => {
    const pageTitle: Record<WrapperPage, string> = {
      landing: `${PRODUCT_NAME} - Investor Lab`,
      login: `Sign in - ${PRODUCT_NAME}`,
      register: `Create account - ${PRODUCT_NAME}`,
      profile: `Investor profile - ${PRODUCT_NAME}`,
      analyzer: `${PRODUCT_NAME} App - Investor Lab`,
    };
    document.title = pageTitle[page];
  }, [page]);

  useEffect(() => {
    const handlePopState = () => {
      setPage(pageFromLocation(window.location));
      setRoute(routeFromLocation(window.location));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const goToPage = useCallback((nextPage: Exclude<WrapperPage, 'analyzer'>, replace = false) => {
    navigateWrapper(nextPage, replace);
    setPage(nextPage);
    setRoute(routeFromLocation(window.location));
  }, []);

  const goToAnalyzer = useCallback((replace = false) => {
    if (replace) {
      window.history.replaceState(null, '', routeToPath({ kind: 'analyze' }));
    } else {
      window.history.pushState(null, '', routeToPath({ kind: 'analyze' }));
    }
    setPage('analyzer');
    setRoute({ kind: 'analyze' });
  }, []);

  const persistAuth = useCallback((nextAuth: InvestorLabAuthState | null) => {
    storeAuth(nextAuth);
    setAuth(nextAuth);
  }, []);

  const signOut = useCallback(() => {
    persistAuth(null);
    goToPage('login', true);
  }, [goToPage, persistAuth]);

  const handleAuthSubmit = useCallback(async (mode: 'login' | 'register', form: typeof EMPTY_AUTH_FORM) => {
    const response = await investorLabAuthFetch<InvestorLabAuthState>(`/api/investor-lab/auth/${mode}`, {
      method: 'POST',
      body: JSON.stringify(form),
    });
    persistAuth(response);
    goToAnalyzer(true);
  }, [goToAnalyzer, persistAuth]);

  const handleProfileSave = useCallback(async (form: typeof EMPTY_PROFILE_FORM) => {
    if (!auth) throw new Error(`${PRODUCT_NAME} account required.`);
    const response = await investorLabAuthFetch<{ user: InvestorLabUser }>(
      '/api/investor-lab/auth/me',
      {
        method: 'PATCH',
        body: JSON.stringify(form),
      },
      auth.token,
    );
    persistAuth({ ...auth, user: response.user });
  }, [auth, persistAuth]);

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
      if (path === '/profile') return absolute(wrapperPath('profile'));
      if (path === '/') return absolute(wrapperPath('landing'));
      return absolute(path);
    },
    navigateExternal(path, options) {
      if (path === '/login') {
        signOut();
        return;
      }
      if (path === '/profile') {
        goToPage('profile', options?.replace);
        return;
      }
      const url = absolute(path);
      if (options?.replace) {
        window.location.replace(url);
        return;
      }
      window.location.href = url;
    },
  }), [goToPage, signOut]);

  const themeToggle = <ThemeToggle theme={theme} onChange={setTheme} />;

  const props = useMemo<PropertyAnalyzerCoreProps>(() => ({
    basePath: APP_PATH,
    initialRoute: route,
    adapters: {
      auth: {
        isLoading: false,
        async getSession() {
          return auth ? createAnalyzerSession(auth.user) : null;
        },
        async requireSession() {
          if (!auth) throw new Error(`${PRODUCT_NAME} account required.`);
          return createAnalyzerSession(auth.user);
        },
        onUnauthorized(error) {
          console.warn(`${PRODUCT_NAME} session required:`, error);
          goToPage('login', true);
        },
        signOut() {
          signOut();
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
      productName: PRODUCT_NAME,
      platformName: PRODUCT_NAME,
      logoText: PRODUCT_NAME,
      logoSrc: BRAND_GAUGE_SRC,
      logoAlt: `${PRODUCT_NAME} logo`,
      homeLabel: `${PRODUCT_NAME} home`,
      themeClassName: `analyzer-app reference-saas-analyzer reference-saas-analyzer--${theme}`,
    },
    shellSlots: {
      header: themeToggle,
      loadingFallback: <div className="reference-saas-smoke">Loading reference SaaS analyzer...</div>,
      assistant: () => null,
      publicSharedBanner: <span>{PRODUCT_NAME} public view fixture</span>,
    },
  }), [api, auth, goToPage, navigation, route, signOut, storage, theme, themeToggle]);

  if (page === 'landing') {
    return <LandingPage onNavigate={goToPage} />;
  }
  if (page === 'login' || page === 'register') {
    return <AuthPage mode={page} onSubmit={handleAuthSubmit} onNavigate={goToPage} />;
  }
  if (page === 'profile') {
    const profilePage = auth
      ? <ProfilePage auth={auth} onSave={handleProfileSave} onSignOut={signOut} />
      : <AuthPage mode="login" onSubmit={handleAuthSubmit} onNavigate={goToPage} />;
    return profilePage;
  }
  if (!auth) {
    return <AuthPage mode="login" onSubmit={handleAuthSubmit} onNavigate={goToPage} />;
  }

  return <PropertyAnalyzerCore {...props} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReferenceSaasWrapper />
  </StrictMode>,
);
