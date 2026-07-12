import { Router, type RequestHandler } from 'express';
import type { OwnerContext } from '@deal-platform/shared-types';
import type { AuthRequest } from '../middleware/auth.js';
import {
  authenticateOptional,
  authenticateToken,
} from '../middleware/auth.js';
import { buildAssetDashboardOwnerContext } from '../middleware/ownerContext.js';

type RouterModule = { default: Router };
type RouterLoaderResult = Router | RouterModule;

export type AnalyzerMountPath = 'analyzer' | 'property' | 'comparisons' | 'ai' | 'xome';

export interface AnalyzerBackendAuth {
  requireAuth: RequestHandler;
  optionalAuth: RequestHandler;
  buildOwnerContext: (req: AuthRequest) => Promise<OwnerContext>;
}

export interface AnalyzerBackendConfig {
  platform: string;
  tenantId: string;
  providerCachePlatform: string;
}

export interface LazyAnalyzerProviderRegistry {
  propertyData: () => Promise<typeof import('../services/propertyDataService.js')>;
  rentCast: () => Promise<typeof import('../services/rentCastService.js')>;
  realtyInUs: () => Promise<typeof import('../services/realtyInUsService.js')>;
  airDna: () => Promise<typeof import('../services/airDnaService.js')>;
  furnishedFinder: () => Promise<typeof import('../services/furnishedFinderService.js')>;
  geocoding: () => Promise<typeof import('../services/geocodingService.js')>;
  areaMarket: () => Promise<typeof import('../services/areaMarketService.js')>;
  providerCache: () => Promise<typeof import('../services/providerCacheAdapter.js')>;
  providerPolicies: () => Promise<typeof import('../services/providerPolicyRegistry.js')>;
}

export interface AnalyzerBackendRuntime {
  auth: AnalyzerBackendAuth;
  config: AnalyzerBackendConfig;
  providers: LazyAnalyzerProviderRegistry;
}

export type AnalyzerRouteLoader = (
  runtime: AnalyzerBackendRuntime,
) => Promise<RouterLoaderResult> | RouterLoaderResult;

export type AnalyzerRouteLoaders = Record<AnalyzerMountPath, AnalyzerRouteLoader>;

export interface AnalyzerBackendOptions {
  auth?: Partial<AnalyzerBackendAuth>;
  config?: Partial<AnalyzerBackendConfig>;
  providers?: LazyAnalyzerProviderRegistry;
  routes?: Partial<AnalyzerRouteLoaders>;
}

function once<T>(loader: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined;
  return () => {
    promise ??= loader();
    return promise;
  };
}

export function createLazyAnalyzerProviderRegistry(): LazyAnalyzerProviderRegistry {
  return {
    propertyData: once(() => import('../services/propertyDataService.js')),
    rentCast: once(() => import('../services/rentCastService.js')),
    realtyInUs: once(() => import('../services/realtyInUsService.js')),
    airDna: once(() => import('../services/airDnaService.js')),
    furnishedFinder: once(() => import('../services/furnishedFinderService.js')),
    geocoding: once(() => import('../services/geocodingService.js')),
    areaMarket: once(() => import('../services/areaMarketService.js')),
    providerCache: once(() => import('../services/providerCacheAdapter.js')),
    providerPolicies: once(() => import('../services/providerPolicyRegistry.js')),
  };
}

function defaultConfig(): AnalyzerBackendConfig {
  return {
    platform: 'asset-dashboard',
    tenantId: 'asset-dashboard',
    providerCachePlatform: process.env.ANALYZER_CACHE_PLATFORM || 'asset-dashboard',
  };
}

function createDefaultRuntime(options: AnalyzerBackendOptions): AnalyzerBackendRuntime {
  const baseConfig = defaultConfig();

  return {
    auth: {
      requireAuth: options.auth?.requireAuth ?? authenticateToken,
      optionalAuth: options.auth?.optionalAuth ?? authenticateOptional,
      buildOwnerContext: options.auth?.buildOwnerContext ?? buildAssetDashboardOwnerContext,
    },
    config: {
      ...baseConfig,
      ...options.config,
    },
    providers: options.providers ?? createLazyAnalyzerProviderRegistry(),
  };
}

function normalizeRouter(result: RouterLoaderResult): Router {
  return 'default' in result ? result.default : result;
}

function mountLazyRouter(
  parent: Router,
  path: string,
  runtime: AnalyzerBackendRuntime,
  loader: AnalyzerRouteLoader,
): void {
  const loadRouter = once(async () => normalizeRouter(await loader(runtime)));

  parent.use(path, async (req, res, next) => {
    try {
      const route = await loadRouter();
      route(req, res, next);
    } catch (err) {
      next(err);
    }
  });
}

function defaultRouteLoaders(): AnalyzerRouteLoaders {
  return {
    analyzer: () => import('../routes/propertyAnalyzer.js'),
    property: () => import('../routes/property.js'),
    comparisons: () => import('../routes/comparisons.js'),
    ai: () => import('../routes/aiComparison.js'),
    xome: () => import('../routes/xome.js'),
  };
}

export function createAnalyzerBackendRouter(options: AnalyzerBackendOptions = {}): Router {
  const router = Router();
  const runtime = createDefaultRuntime(options);
  const routeLoaders = {
    ...defaultRouteLoaders(),
    ...options.routes,
  };

  mountLazyRouter(router, '/property', runtime, routeLoaders.property);
  mountLazyRouter(router, '/analyzer', runtime, routeLoaders.analyzer);
  mountLazyRouter(router, '/ai', runtime, routeLoaders.ai);
  mountLazyRouter(router, '/comparisons', runtime, routeLoaders.comparisons);
  mountLazyRouter(router, '/xome', runtime, routeLoaders.xome);

  return router;
}

export function createAssetDashboardAnalyzerBackendRouter(): Router {
  return createAnalyzerBackendRouter();
}
