import type { OwnerContext, AnalyzerPermission, AnalyzerPlatform } from '@deal-platform/shared-types';
import type { AuthRequest } from './auth.js';
import { pool } from '../db/pool.js';

const ASSET_DASHBOARD_TENANT_ID = 'asset-dashboard';
const ASSET_DASHBOARD_PLATFORM = 'asset-dashboard';

const USER_PERMISSIONS: AnalyzerPermission[] = [
  'analysis:read',
  'analysis:write',
  'analysis:delete',
  'analysis:share',
  'comparison:read',
  'comparison:write',
];

const ADMIN_PERMISSIONS: AnalyzerPermission[] = [
  ...USER_PERMISSIONS,
  'provider-cache:read',
  'provider-cache:write',
  'admin:tenant',
];

export async function buildOwnerContextForPlatform(
  req: AuthRequest,
  tenantId: string,
  platform: AnalyzerPlatform,
): Promise<OwnerContext> {
  if (req.userId == null) {
    throw new Error('Authenticated user id is required to build owner context.');
  }

  const adminResult = await pool.query<{ is_admin: boolean }>(
    'SELECT is_admin FROM users WHERE id = $1',
    [req.userId],
  );

  if (adminResult.rows.length === 0) {
    console.warn(`[owner-context] User ${req.userId} was not found while building owner context.`);
  }

  const isAdmin = adminResult.rows[0]?.is_admin === true;
  const userId = String(req.userId);

  return {
    actorUserId: userId,
    ownerUserId: userId,
    tenantId,
    platform,
    roles: isAdmin ? ['user', 'admin'] : ['user'],
    permissions: [...(isAdmin ? ADMIN_PERMISSIONS : USER_PERMISSIONS)],
  };
}

export async function buildAssetDashboardOwnerContext(req: AuthRequest): Promise<OwnerContext> {
  return buildOwnerContextForPlatform(req, ASSET_DASHBOARD_TENANT_ID, ASSET_DASHBOARD_PLATFORM);
}

export function getOwnerUserId(ownerContext: OwnerContext): number {
  const ownerUserId = Number(ownerContext.ownerUserId);
  if (!Number.isInteger(ownerUserId)) {
    throw new Error('Owner context is missing a valid owner user id.');
  }

  return ownerUserId;
}
