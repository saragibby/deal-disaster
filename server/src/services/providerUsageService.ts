import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export type DataProvider = 'zillow' | 'airdna' | 'rentcast' | 'google' | 'geocoding' | 'census' | 'nominatim' | 'realtor' | 'furnished-finder' | 'xome';
export type UsageWorkflow = 'analysis' | 'reanalysis' | 'dataset-refresh' | 'saved-view' | 'property-records'
  | 'property-records-refresh'
  | 'xome-widget' | 'xome-prewarm' | 'property-lookup' | 'comparison' | 'other-analyzer' | 'background';
type CacheLayer = 'memory' | 'postgres' | 'in-flight' | 'coordinates' | 'session' | 'saved-analysis';
type CacheOutcome = 'hit' | 'miss' | 'stale' | 'error' | 'wait' | 'wait-timeout';
type FallbackReason = 'no-usable-data' | 'insufficient-comps' | 'provider-failed' | 'widen-search'
  | 'cache-unavailable';

// Static labels only: no URL, query, header, address, user ID, or response body enters the ledger.
const operations = {
  zillow: ['byzpid', 'byaddress', 'pricehistory', 'similar', 'housing_market', 'rental_market', 'property-cache'],
  airdna: ['rentalizer', 'market-statistics', 'estimate-cache'],
  rentcast: ['rent-avm', 'rental-listings', 'markets', 'property-records'],
  google: ['geocoding', 'places-nearby', 'places-nearby-new', 'places-text-new'],
  geocoding: ['coordinates'],
  census: ['geocoding'],
  nominatim: ['geocoding'],
  realtor: ['listings'],
  'furnished-finder': ['search'],
  xome: ['listings', 'market-trends'],
} as const;

interface EndpointUsage {
  provider: DataProvider;
  operation: string;
  attempts: number;
  httpResponses: Record<string, number>;
  networkErrors: number;
  pendingAttempts: number;
  headerLatencyMs: number;
  cache: Record<string, number>;
  fallbacks: Record<string, number>;
  estimatedCostUsd: number;
  unknownCostAttempts: number;
  rentCastBillableCandidates: number;
}

interface UsageContext {
  requestId: string;
  parentRequestId?: string;
  workflow: UsageWorkflow;
  startedAt: number;
  endpoints: Map<string, EndpointUsage>;
}

export interface ProviderUsageSummary {
  schemaVersion: 1;
  pricingVersion: '2026-10-16-scenario-v2';
  requestId: string;
  parentRequestId?: string;
  workflow: UsageWorkflow;
  outcome: 'complete' | 'aborted' | 'failed';
  durationMs: number;
  attempts: number;
  estimatedCostUsd: number;
  unknownCostAttempts: number;
  pendingAttempts: number;
  costBasis: 'google-paid-tier-rapidapi-overage-optional-rentcast-rate-excludes-fixed-fees-allowances-and-unknowns';
  endpoints: EndpointUsage[];
}

const storage = new AsyncLocalStorage<UsageContext>();
const defaultReporter = (summary: ProviderUsageSummary) => console.info('[provider:usage]', JSON.stringify(summary));

export function getProviderUsageRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

function endpoint(provider: DataProvider, operation: string): EndpointUsage | undefined {
  const context = storage.getStore();
  if (!context) return undefined;
  const safeOperation = (operations[provider] as readonly string[]).includes(operation) ? operation : 'other';
  const key = `${provider}:${safeOperation}`;
  let row = context.endpoints.get(key);
  if (!row) {
    row = {
      provider, operation: safeOperation, attempts: 0, httpResponses: {}, networkErrors: 0, pendingAttempts: 0,
      headerLatencyMs: 0, cache: {}, fallbacks: {}, estimatedCostUsd: 0,
      unknownCostAttempts: 0, rentCastBillableCandidates: 0,
    };
    context.endpoints.set(key, row);
  }
  return row;
}

export function recordProviderCache(
  provider: DataProvider, operation: string, layer: CacheLayer, outcome: CacheOutcome, count = 1,
): void {
  const row = endpoint(provider, operation);
  if (!row || !Number.isSafeInteger(count) || count <= 0) return;
  const key = `${layer}:${outcome}`;
  row.cache[key] = (row.cache[key] ?? 0) + count;
}

export function recordProviderFallback(provider: DataProvider, operation: string, reason: FallbackReason): void {
  const row = endpoint(provider, operation);
  if (row) row.fallbacks[reason] = (row.fallbacks[reason] ?? 0) + 1;
}

function context(workflow: UsageWorkflow, parentRequestId?: string): UsageContext {
  return {
    requestId: randomUUID(), workflow, startedAt: performance.now(), endpoints: new Map(),
    ...(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parentRequestId ?? '')
      ? { parentRequestId } : {}),
  };
}

function summarize(value: UsageContext, outcome: ProviderUsageSummary['outcome']): ProviderUsageSummary {
  const endpoints = [...value.endpoints.values()].map(row => ({
    ...structuredClone(row), estimatedCostUsd: Number(row.estimatedCostUsd.toFixed(6)),
  }));
  return {
    schemaVersion: 1, pricingVersion: '2026-10-16-scenario-v2',
    requestId: value.requestId,
    ...(value.parentRequestId ? { parentRequestId: value.parentRequestId } : {}),
    workflow: value.workflow, outcome, durationMs: Math.round(performance.now() - value.startedAt),
    attempts: endpoints.reduce((sum, row) => sum + row.attempts, 0),
    estimatedCostUsd: Number(endpoints.reduce((sum, row) => sum + row.estimatedCostUsd, 0).toFixed(6)),
    unknownCostAttempts: endpoints.reduce((sum, row) => sum + row.unknownCostAttempts, 0),
    pendingAttempts: endpoints.reduce((sum, row) => sum + row.pendingAttempts, 0),
    costBasis: 'google-paid-tier-rapidapi-overage-optional-rentcast-rate-excludes-fixed-fees-allowances-and-unknowns',
    endpoints,
  };
}

export async function withProviderUsage<T>(
  workflow: UsageWorkflow, work: () => Promise<T>,
  report = defaultReporter,
): Promise<T> {
  const value = context(workflow);
  return storage.run(value, async () => {
    let outcome: ProviderUsageSummary['outcome'] = 'complete';
    try {
      return await work();
    } catch (error) {
      outcome = 'failed';
      throw error;
    } finally {
      report(summarize(value, outcome));
    }
  });
}

function workflowFor(rawPath: string, method: string): UsageWorkflow {
  const path = rawPath.replace(/\/+$/, '').toLowerCase();
  if (path === '/analyzer/run' && method === 'POST') return 'analysis';
  if (path.startsWith('/analyzer/re-analyze/')) return 'reanalysis';
  if (/\/property-records\/refresh$/.test(path)) return 'property-records-refresh';
  if (/^\/analyzer\/history\/[^/]+\/refresh-missing$/.test(path) && method === 'POST') return 'dataset-refresh';
  if (/\/property-records$/.test(path)) return 'property-records';
  if (path.startsWith('/analyzer/history') || path.startsWith('/analyzer/shared/')) return 'saved-view';
  if (path.startsWith('/xome/')) return 'xome-widget';
  if (path.startsWith('/property/')) return 'property-lookup';
  if (path.startsWith('/comparisons') || path.startsWith('/ai/')) return 'comparison';
  return 'other-analyzer';
}

export function providerUsageMiddleware(report = defaultReporter): RequestHandler {
  return (req, res, next) => {
    if (!/^\/(analyzer|property|xome|comparisons|ai)(\/|$)/i.test(req.path)) {
      next();
      return;
    }
    const value = context(workflowFor(req.path, req.method), req.get('X-Analysis-Request-Id'));
    res.setHeader('X-Provider-Request-Id', value.requestId);
    res.append('Access-Control-Expose-Headers', 'X-Provider-Request-Id');
    let reported = false;
    const finish = (aborted: boolean) => {
      if (reported) return;
      reported = true;
      report(summarize(value, aborted ? 'aborted' : res.statusCode >= 400 ? 'failed' : 'complete'));
    };
    res.once('finish', () => finish(false));
    res.once('close', () => finish(!res.writableFinished));
    storage.run(value, next);
  };
}

function operationFor(provider: DataProvider, input: Parameters<typeof fetch>[0]): string {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const path = url.pathname.toLowerCase();
  if (provider === 'zillow') return path.split('/').pop() ?? 'other';
  if (provider === 'airdna') return path === '/rentalizer' ? 'rentalizer' : path === '/v1/market/statistics' ? 'market-statistics' : 'other';
  if (provider === 'rentcast') {
    return ({
      '/v1/markets': 'markets', '/v1/properties': 'property-records',
      '/v1/avm/rent/long-term': 'rent-avm', '/v1/listings/rental/long-term': 'rental-listings',
    } as Record<string, string>)[path] ?? 'other';
  }
  if (provider === 'google') {
    if (path === '/v1/places:searchnearby') return 'places-nearby-new';
    if (path === '/v1/places:searchtext') return 'places-text-new';
    return path.includes('/geocode/') ? 'geocoding' : path.includes('/place/nearbysearch/') ? 'places-nearby' : 'other';
  }
  if (provider === 'census' || provider === 'nominatim') return 'geocoding';
  if (provider === 'furnished-finder') return 'search';
  if (provider === 'realtor') return 'listings';
  return path.endsWith('/markettrends') ? 'market-trends' : path.endsWith('/listing/search') ? 'listings' : 'other';
}

export function createProviderFetch(provider: DataProvider): typeof fetch {
  return async (input, init) => {
    if (!storage.getStore()) return withProviderUsage('background', () => tracked(input, init));
    return tracked(input, init);
  };

  async function tracked(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
    const operation = operationFor(provider, input);
    const row = endpoint(provider, operation)!;
    row.attempts++;
    row.pendingAttempts++;
    row.unknownCostAttempts++;
    const started = performance.now();
    try {
      // Resolve global fetch at call time so existing mocks and transport behavior remain intact.
      const response = await globalThis.fetch(input, init);
      row.httpResponses[String(response.status)] = (row.httpResponses[String(response.status)] ?? 0) + 1;
      if (provider === 'rentcast' && response.status === 200 && response.body !== null) row.rentCastBillableCandidates++;
      if (provider === 'census' || provider === 'nominatim' || provider === 'xome') {
        row.unknownCostAttempts--;
        // No direct provider fee in this model; infrastructure and map/photo traffic are excluded.
      } else if (provider === 'zillow' || provider === 'airdna') {
        row.unknownCostAttempts--;
        row.estimatedCostUsd += 0.01;
      } else if (provider === 'google' && response.ok && operation !== 'other') {
        row.unknownCostAttempts--;
        row.estimatedCostUsd += operation === 'geocoding' ? 0.005 : 0.032;
      } else if (provider === 'rentcast' && response.status === 200 && response.body !== null) {
        const configuredRate = process.env.RENTCAST_ESTIMATED_USD_PER_BILLABLE_REQUEST;
        if (configuredRate !== undefined) {
          const rate = configuredRate.trim() === '' ? NaN : Number(configuredRate);
          if (Number.isFinite(rate) && rate >= 0) {
            row.unknownCostAttempts--;
            row.estimatedCostUsd += rate;
          } else {
            console.warn('[provider:usage] Invalid configured RentCast cost rate; charge remains unknown');
          }
        }
      } else if (provider === 'rentcast' && (response.status !== 200 || response.body === null)) {
        row.unknownCostAttempts--;
        // Documented billable-response rule; a 200 stream is only a candidate, not proof of a nonempty body.
      }
      return response;
    } catch (error) {
      row.networkErrors++;
      throw error;
    } finally {
      row.pendingAttempts--;
      row.headerLatencyMs += Math.round(performance.now() - started);
    }
  }
}
