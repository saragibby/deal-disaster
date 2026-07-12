import { test as base, expect } from '@playwright/test';
import pg from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  DEFAULT_ANALYSIS_PARAMS,
  type AnalysisParams,
  type FullAnalysisResult,
  type PropertyAnalysis,
  type PropertyData,
  type RentalComp,
} from '@deal-platform/shared-types';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../server/.env') });

const { Pool } = pg;
const FIXTURE_SLUG_PATTERN = 'e2e-pa-%';

export const PROPERTY_ANALYZER_FIXTURE_USERS = {
  owner: {
    email: 'e2e-pa-owner@example.com',
    password: 'TestPass123!',
    name: 'E2E Property Owner',
  },
  other: {
    email: 'e2e-pa-other@example.com',
    password: 'TestPass123!',
    name: 'E2E Other Property Owner',
  },
} as const;

const FIXTURE_EMAILS = [
  PROPERTY_ANALYZER_FIXTURE_USERS.owner.email,
  PROPERTY_ANALYZER_FIXTURE_USERS.other.email,
];

interface SeedUserInput {
  email: string;
  password: string;
  name: string;
}

export interface SeededPropertyAnalyzerUser extends SeedUserInput {
  id: number;
}

export interface SeededSavedComparison {
  id: number;
  name: string;
  property_slugs: string[];
  created_at: string;
  updated_at: string;
}

export interface SeedPropertyAnalysisOptions {
  userId: number;
  index: number;
  slugPrefix: string;
  isShared?: boolean;
}

export interface PropertyAnalyzerFixtureSet {
  owner: SeededPropertyAnalyzerUser;
  other: SeededPropertyAnalyzerUser;
  ownedAnalyses: PropertyAnalysis[];
  nonOwnedAnalyses: PropertyAnalysis[];
  publicAnalysis: PropertyAnalysis;
  privateAnalysis: PropertyAnalysis;
  savedComparisons: SeededSavedComparison[];
}

function createPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to seed Property Analyzer E2E fixtures.');
  }

  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('amazonaws.com')
      ? { rejectUnauthorized: false }
      : false,
  });
}

async function withFixtureDb<T>(fn: (pool: pg.Pool) => Promise<T>): Promise<T> {
  const pool = createPool();
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

export async function ensurePropertyAnalyzerFixtureSchema(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS property_analyses (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slug VARCHAR(100) NOT NULL,
      zillow_url VARCHAR(1000) NOT NULL,
      zpid VARCHAR(50),
      source_url VARCHAR(1000),
      source_type VARCHAR(50) DEFAULT 'address',
      property_data JSONB NOT NULL,
      analysis_params JSONB NOT NULL,
      analysis_results JSONB NOT NULL,
      rental_comps JSONB,
      user_overrides JSONB,
      is_shared BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query('ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS source_url VARCHAR(1000)');
  await pool.query("ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'address'");
  await pool.query('ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS user_overrides JSONB');
  await pool.query('ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT FALSE');
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_property_analyses_user_slug
    ON property_analyses(user_id, slug)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_comparisons (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      property_slugs TEXT[] NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_saved_comparisons_user
    ON saved_comparisons(user_id, updated_at DESC)
  `);
}

export async function cleanupPropertyAnalyzerFixtures() {
  await withFixtureDb(async (pool) => {
    await ensurePropertyAnalyzerFixtureSchema(pool);

    await pool.query(
      `DELETE FROM saved_comparisons
       WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))
          OR EXISTS (
            SELECT 1 FROM unnest(property_slugs) AS slug
            WHERE slug LIKE $2
          )`,
      [FIXTURE_EMAILS, FIXTURE_SLUG_PATTERN],
    );

    await pool.query(
      `DELETE FROM property_analyses
       WHERE slug LIKE $1
          OR user_id IN (SELECT id FROM users WHERE email = ANY($2))`,
      [FIXTURE_SLUG_PATTERN, FIXTURE_EMAILS],
    );

    await pool.query('DELETE FROM users WHERE email = ANY($1)', [FIXTURE_EMAILS]);
  });
}

export async function seedPropertyAnalyzerUser(
  pool: pg.Pool,
  user: SeedUserInput,
): Promise<SeededPropertyAnalyzerUser> {
  const passwordHash = await bcrypt.hash(user.password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, email_verified)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = $2,
       name = $3,
       email_verified = true,
       verification_token = NULL,
       verification_token_expires = NULL
     RETURNING id`,
    [user.email, passwordHash, user.name],
  );

  return { ...user, id: rows[0].id };
}

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildProperty(index: number): PropertyData {
  const price = 250000 + index * 35000;

  return {
    zpid: `e2e-zpid-${index}`,
    address: `${100 + index} Fixture Lane`,
    city: index % 2 === 0 ? 'Austin' : 'Raleigh',
    state: index % 2 === 0 ? 'TX' : 'NC',
    zip: `${78000 + index}`,
    price,
    zestimate: price + 7500,
    rentZestimate: 1800 + index * 125,
    bedrooms: 2 + (index % 4),
    bathrooms: 1.5 + (index % 3) * 0.5,
    sqft: 1200 + index * 110,
    lotSize: 4500 + index * 250,
    yearBuilt: 1995 + index,
    propertyType: index % 3 === 0 ? 'Townhouse' : 'Single Family',
    description: `Deterministic E2E fixture property ${index}.`,
    photos: [`https://example.test/e2e-property-${index}.jpg`],
    taxHistory: [{ year: 2025, amount: 3200 + index * 175 }],
    priceHistory: [
      { date: '2023-01-15', price: price - 25000, event: 'Sold' },
      { date: '2025-06-01', price, event: 'Listed for sale' },
    ],
    hoaFee: index % 3 === 0 ? 175 : 0,
    latitude: 35.7 + index * 0.01,
    longitude: -78.6 - index * 0.01,
    zillowUrl: `https://example.test/property-analyzer/fixtures/${index}`,
  };
}

function buildAnalysisParams(property: PropertyData, index: number): AnalysisParams {
  return {
    ...DEFAULT_ANALYSIS_PARAMS,
    downPaymentPct: 20,
    interestRate: 6.75 + index * 0.05,
    annualPropertyTax: property.taxHistory?.[0]?.amount ?? DEFAULT_ANALYSIS_PARAMS.annualPropertyTax,
    annualInsurance: 1400 + index * 90,
    monthlyHoa: property.hoaFee ?? 0,
    offerPrice: property.price,
    rentOverride: property.rentZestimate ?? 0,
  };
}

function buildRentalComps(index: number): RentalComp[] {
  return [
    {
      address: `${200 + index} Fixture Rental A`,
      rent: 1750 + index * 125,
      bedrooms: 3,
      bathrooms: 2,
      sqft: 1350 + index * 80,
      distance: 0.4,
      source: 'estimate',
    },
    {
      address: `${300 + index} Fixture Rental B`,
      rent: 1825 + index * 125,
      bedrooms: 3,
      bathrooms: 2,
      sqft: 1400 + index * 80,
      distance: 0.8,
      source: 'estimate',
    },
  ];
}

function buildAnalysisResults(
  property: PropertyData,
  params: AnalysisParams,
  rentalComps: RentalComp[],
  index: number,
): FullAnalysisResult {
  const rent = params.rentOverride;
  const loanAmount = property.price * (1 - params.downPaymentPct / 100);
  const monthlyMortgage = round(loanAmount * 0.0064);
  const monthlyTax = round(params.annualPropertyTax / 12);
  const monthlyInsurance = round(params.annualInsurance / 12);
  const monthlyVacancy = round(rent * (params.vacancyPct / 100));
  const monthlyRepairs = round(rent * (params.repairsPct / 100));
  const monthlyCapex = round(rent * (params.capexPct / 100));
  const monthlyManagement = round(rent * (params.managementPct / 100));
  const totalMonthlyExpenses = monthlyMortgage + monthlyTax + monthlyInsurance +
    params.monthlyHoa + monthlyVacancy + monthlyRepairs + monthlyCapex + monthlyManagement;
  const monthlyCashFlow = round(rent - totalMonthlyExpenses);
  const totalCashInvested = round(property.price * (params.downPaymentPct / 100) + 6000 + index * 250);
  const annualCashFlow = monthlyCashFlow * 12;
  const cashOnCashROI = round((annualCashFlow / totalCashInvested) * 100, 1);
  const mtrNet = rent + 350 + index * 25;
  const strNet = rent + 500 + index * 40;
  const carryingCosts = totalMonthlyExpenses - rent + monthlyVacancy + monthlyRepairs + monthlyCapex;

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
      cashOnCashROI,
      capRate: round(((rent * 12 - (totalMonthlyExpenses - monthlyMortgage) * 12) / property.price) * 100, 1),
      grossRentMultiplier: round(property.price / (rent * 12), 1),
    },
    taxSavings: {
      purchasePrice: property.price,
      depreciationDeduction: round(property.price * 0.8 / 27.5),
      taxSavings: round(property.price * 0.8 / 27.5 * (params.taxRate / 100)),
      effectiveFirstYearReturn: round(cashOnCashROI + 1.5, 1),
    },
    rentalEstimate: {
      low: rent - 150,
      mid: rent,
      high: rent + 150,
      confidence: 'high',
      comps: rentalComps,
    },
    strategyComparison: {
      strategies: [
        {
          key: 'LTR',
          label: 'Long-Term Rental',
          available: true,
          grossMonthly: rent,
          netRentalIncome: rent,
          netCashFlow: monthlyCashFlow,
          confidence: 'high',
          source: 'algorithm',
        },
        {
          key: 'MTR',
          label: 'Mid-Term Rental',
          available: true,
          grossMonthly: mtrNet + 300,
          netRentalIncome: mtrNet,
          netCashFlow: round(mtrNet - carryingCosts),
          confidence: 'medium',
          source: 'algorithm',
        },
        {
          key: 'STR',
          label: 'Short-Term Rental',
          available: true,
          grossMonthly: strNet + 500,
          netRentalIncome: strNet,
          netCashFlow: round(strNet - carryingCosts),
          confidence: 'medium',
          source: 'algorithm',
        },
      ],
      bestKey: 'STR',
      bestNetCashFlow: round(strNet - carryingCosts),
    },
    breakEvenRent: totalMonthlyExpenses,
    comparables: [],
    verdict: {
      rating: monthlyCashFlow > 0 ? 'strong' : 'marginal',
      score: Math.min(95, 70 + index),
      headline: `Fixture property ${index} has deterministic analyzer results.`,
      reasons: [
        {
          code: 'fixture-data',
          label: 'Seeded from deterministic E2E fixture data',
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

export async function seedPropertyAnalysis(
  pool: pg.Pool,
  options: SeedPropertyAnalysisOptions,
): Promise<PropertyAnalysis> {
  const property = buildProperty(options.index);
  const params = buildAnalysisParams(property, options.index);
  const rentalComps = buildRentalComps(options.index);
  const results = buildAnalysisResults(property, params, rentalComps, options.index);
  const slug = `${options.slugPrefix}-${options.index}`;
  const createdAt = new Date(Date.UTC(2026, 0, options.index, 12, 0, 0));

  const { rows } = await pool.query(
    `INSERT INTO property_analyses (
       user_id, slug, zillow_url, zpid, source_url, source_type, property_data,
       analysis_params, analysis_results, rental_comps, user_overrides, is_shared, created_at
     )
     VALUES ($1, $2, $3, $4, $5, 'address', $6, $7, $8, $9, NULL, $10, $11)
     ON CONFLICT (user_id, slug) DO UPDATE SET
       zillow_url = EXCLUDED.zillow_url,
       zpid = EXCLUDED.zpid,
       source_url = EXCLUDED.source_url,
       source_type = EXCLUDED.source_type,
       property_data = EXCLUDED.property_data,
       analysis_params = EXCLUDED.analysis_params,
       analysis_results = EXCLUDED.analysis_results,
       rental_comps = EXCLUDED.rental_comps,
       user_overrides = EXCLUDED.user_overrides,
       is_shared = EXCLUDED.is_shared,
       created_at = EXCLUDED.created_at
     RETURNING id, user_id, slug, zillow_url, zpid, source_url, source_type,
       property_data, analysis_params, analysis_results, rental_comps,
       user_overrides, is_shared, created_at`,
    [
      options.userId,
      slug,
      property.zillowUrl,
      property.zpid,
      property.zillowUrl,
      JSON.stringify(property),
      JSON.stringify(params),
      JSON.stringify(results),
      JSON.stringify(rentalComps),
      options.isShared ?? false,
      createdAt,
    ],
  );

  return rows[0];
}

export async function seedSavedComparison(
  pool: pg.Pool,
  userId: number,
  name: string,
  propertySlugs: string[],
): Promise<SeededSavedComparison> {
  if (propertySlugs.length < 2 || propertySlugs.length > 6) {
    throw new Error('Property Analyzer comparison fixtures must contain 2 to 6 property slugs.');
  }

  const { rows: validRows } = await pool.query(
    'SELECT slug FROM property_analyses WHERE user_id = $1 AND slug = ANY($2)',
    [userId, propertySlugs],
  );
  if (validRows.length !== propertySlugs.length) {
    throw new Error('All comparison fixture slugs must belong to the seeded user.');
  }

  const { rows } = await pool.query(
    `INSERT INTO saved_comparisons (user_id, name, property_slugs)
     VALUES ($1, $2, $3)
     RETURNING id, name, property_slugs, created_at, updated_at`,
    [userId, name, propertySlugs],
  );

  return rows[0];
}

export async function seedPropertyAnalyzerFixtures(options?: {
  ownedCount?: number;
  nonOwnedCount?: number;
  comparisonSizes?: number[];
}): Promise<PropertyAnalyzerFixtureSet> {
  return withFixtureDb(async (pool) => {
    await ensurePropertyAnalyzerFixtureSchema(pool);

    const owner = await seedPropertyAnalyzerUser(pool, PROPERTY_ANALYZER_FIXTURE_USERS.owner);
    const other = await seedPropertyAnalyzerUser(pool, PROPERTY_ANALYZER_FIXTURE_USERS.other);
    const ownedCount = options?.ownedCount ?? 6;
    const nonOwnedCount = options?.nonOwnedCount ?? 2;
    const comparisonSizes = options?.comparisonSizes ?? [2, 3, 4, 5, 6];

    if (ownedCount < Math.max(...comparisonSizes)) {
      throw new Error('ownedCount must be at least as large as the largest requested comparison size.');
    }

    const ownedAnalyses: PropertyAnalysis[] = [];
    for (let index = 1; index <= ownedCount; index += 1) {
      ownedAnalyses.push(await seedPropertyAnalysis(pool, {
        userId: owner.id,
        index,
        slugPrefix: 'e2e-pa-owned',
        isShared: index === 1,
      }));
    }

    const nonOwnedAnalyses: PropertyAnalysis[] = [];
    for (let index = 1; index <= nonOwnedCount; index += 1) {
      nonOwnedAnalyses.push(await seedPropertyAnalysis(pool, {
        userId: other.id,
        index,
        slugPrefix: 'e2e-pa-non-owned',
        isShared: index === 1,
      }));
    }

    const savedComparisons: SeededSavedComparison[] = [];
    for (const size of comparisonSizes) {
      savedComparisons.push(await seedSavedComparison(
        pool,
        owner.id,
        `E2E ${size}-Property Comparison`,
        ownedAnalyses.slice(0, size).map(analysis => analysis.slug),
      ));
    }

    return {
      owner,
      other,
      ownedAnalyses,
      nonOwnedAnalyses,
      publicAnalysis: ownedAnalyses[0],
      privateAnalysis: ownedAnalyses[1],
      savedComparisons,
    };
  });
}

export const propertyAnalyzerTest = base.extend<{
  propertyFixtures: PropertyAnalyzerFixtureSet;
}>({
  propertyFixtures: async ({}, use) => {
    await cleanupPropertyAnalyzerFixtures();
    const fixtures = await seedPropertyAnalyzerFixtures();

    try {
      await use(fixtures);
    } finally {
      await cleanupPropertyAnalyzerFixtures();
    }
  },
});

export { expect };
