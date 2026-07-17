import { Router, type RequestHandler } from 'express';
import type { OwnerContext } from '@deal-platform/shared-types';
import type { AuthRequest } from '../middleware/auth.js';
import { authenticateOptional, authenticateToken } from '../middleware/auth.js';
import { buildAssetDashboardOwnerContext } from '../middleware/ownerContext.js';

type RouterModule = { default: Router };
type RouterFactoryModule = { createPropertyAnalyzerRouter: (runtime: AnalyzerBackendRuntime) => Router };
type RouterLoaderResult = Router | RouterModule | RouterFactoryModule;

export type AnalyzerMountPath = 'analyzer' | 'property' | 'comparisons' | 'ai' | 'xome';

export interface AnalyzerBackendAuth {
  requireAuth: RequestHandler;
  optionalAuth: RequestHandler;
  buildOwnerContext: (req: AuthRequest) => Promise<OwnerContext>;
}

export interface AnalyzerBackendConfig {
  platform: string;
  tenantId: string;
}

export interface AnalyzerBackendRuntime {
  auth: AnalyzerBackendAuth;
  config: AnalyzerBackendConfig;
}

export type AnalyzerRouteLoader = (
  runtime: AnalyzerBackendRuntime,
) => Promise<RouterLoaderResult> | RouterLoaderResult;

export type AnalyzerRouteLoaders = Record<AnalyzerMountPath, AnalyzerRouteLoader>;

export interface AnalyzerBackendOptions {
  auth?: Partial<AnalyzerBackendAuth>;
  config?: Partial<AnalyzerBackendConfig>;
  routes?: Partial<AnalyzerRouteLoaders>;
}

function once<T>(loader: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined;
  return () => {
    promise ??= loader();
    return promise;
  };
}

function createRuntime(options: AnalyzerBackendOptions): AnalyzerBackendRuntime {
  return {
    auth: {
      requireAuth: options.auth?.requireAuth ?? authenticateToken,
      optionalAuth: options.auth?.optionalAuth ?? authenticateOptional,
      buildOwnerContext: options.auth?.buildOwnerContext ?? buildAssetDashboardOwnerContext,
    },
    config: {
      platform: 'asset-dashboard',
      tenantId: 'asset-dashboard',
      ...options.config,
    },
  };
}

function normalizeRouter(result: RouterLoaderResult): Router {
  if ('createPropertyAnalyzerRouter' in result) {
    throw new Error('Router factory modules must be normalized with runtime.');
  }
  return 'default' in result ? result.default : result;
}

function normalizeRouterWithRuntime(result: RouterLoaderResult, runtime: AnalyzerBackendRuntime): Router {
  if ('createPropertyAnalyzerRouter' in result) return result.createPropertyAnalyzerRouter(runtime);
  return normalizeRouter(result);
}

function mountLazyRouter(
  parent: Router,
  path: string,
  runtime: AnalyzerBackendRuntime,
  loader: AnalyzerRouteLoader,
): void {
  const loadRouter = once(async () => normalizeRouterWithRuntime(await loader(runtime), runtime));

  parent.use(path, async (req, res, next) => {
    try {
      const route = await loadRouter();
      route(req, res, next);
    } catch (error) {
      next(error);
    }
  });
}

function defaultRouteLoaders(): AnalyzerRouteLoaders {
  return {
    analyzer: () => import('../routes/propertyAnalyzer.js'),
    property: () => import('../routes/property.js'),
    comparisons: () => import('../routes/comparisons.js'),
    ai: () => import('../routes/aiComparison.js'),
    xome: (runtime) => import('../routes/xome.js').then((module) => module.createXomeRouter(runtime.auth.requireAuth)),
  };
}

export function createAnalyzerBackendRouter(options: AnalyzerBackendOptions = {}): Router {
  const router = Router();
  const runtime = createRuntime(options);
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
