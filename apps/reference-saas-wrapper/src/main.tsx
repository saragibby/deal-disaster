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

const BASE_PATH = '/investor-lab';
const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3002';
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
    description: `Reference SaaS fixture generated from source ${sourceSuffix} through injected mock adapters.`,
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
      throw new Error(`Reference SaaS fixture "${slug}" was not found.`);
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
      return buildMarketTrendRows(postalCode);
    },
    async submitFeedback() {
      return { ok: true };
    },
  };
}

async function investorLabFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Investor-Lab-Email': SAAS_SESSION.email ?? 'member@investor-lab.example',
      ...init.headers,
    },
  });

  if (!response.ok) {
    let message = `Investor Lab API ${response.status}`;
    try {
      const body = await response.json() as { error?: string };
      if (body.error) message = body.error;
    } catch { /* keep status message */ }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function createInvestorLabApi(): AnalyzerApiClient {
  const fallback = createMockApi();

  return {
    ...fallback,
    runAnalysis(input) {
      return investorLabFetch<PropertyAnalysis>('/api/investor-lab/analyzer/run', {
        method: 'POST',
        body: JSON.stringify({ url: input.url, params: input.params }),
      });
    },
    async getHistory({ page = 1, limit = 10 }) {
      const response = await investorLabFetch<{ analyses: PropertyAnalysis[]; total: number; page: number; limit: number }>(
        `/api/investor-lab/analyzer/history?page=${page}&limit=${limit}`,
      );
      return { items: response.analyses, total: response.total, page: response.page, limit: response.limit };
    },
    async getAnalysis(slug) {
      const response = await investorLabFetch<{ analysis: PropertyAnalysis }>(
        `/api/investor-lab/analyzer/history/${encodeURIComponent(slug)}`,
      );
      return response.analysis;
    },
    async deleteAnalysis(slug) {
      await investorLabFetch<{ success: boolean }>(`/api/investor-lab/analyzer/history/${encodeURIComponent(slug)}`, {
        method: 'DELETE',
      });
    },
    reAnalyze(slug, params) {
      return investorLabFetch<PropertyAnalysis>(`/api/investor-lab/analyzer/re-analyze/${encodeURIComponent(slug)}`, {
        method: 'POST',
        body: JSON.stringify({ params }),
      });
    },
    async saveAdjustments(slug, payload) {
      await investorLabFetch<{ success: boolean }>(`/api/investor-lab/analyzer/history/${encodeURIComponent(slug)}/overrides`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    searchForeclosures(params) {
      return investorLabFetch<unknown>('/api/investor-lab/xome/search', {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },
    getMarketTrends(postalCode) {
      return investorLabFetch<unknown>(
        `/api/investor-lab/xome/market-trends?postalCode=${encodeURIComponent(postalCode)}`,
      );
    },
  };
}

function ReferenceSaasWrapper() {
  const [route, setRoute] = useState<AnalyzerRoute>(() => routeFromLocation(window.location));
  const api = useMemo(() => createInvestorLabApi(), []);
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
      themeClassName: 'analyzer-app reference-saas-analyzer',
    },
    shellSlots: {
      loadingFallback: <div className="reference-saas-smoke">Loading reference SaaS analyzer...</div>,
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
