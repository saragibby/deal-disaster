import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { getProviderUsageReport, USAGE_RETENTION_DAYS } from '../services/providerUsageReportingService.js';

const workflows = new Set([
  'analysis', 'reanalysis', 'dataset-refresh', 'saved-view', 'property-records',
  'property-records-refresh', 'xome-widget', 'xome-prewarm', 'property-lookup',
  'comparison', 'other-analyzer', 'background',
]);

export function usageReportRange(query: Record<string, unknown>, now = new Date()) {
  const from = query.from ?? new Date(now.getTime() - 7 * 86400000).toISOString();
  const to = query.to ?? now.toISOString();
  const validDate = (value: unknown): value is string =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value.slice(0, 10);
  if (!validDate(from) || !validDate(to) || Date.parse(to) <= Date.parse(from)
    || Date.parse(to) - Date.parse(from) > USAGE_RETENTION_DAYS * 86400000
    || Date.parse(to) > now.getTime() + 86400000) {
    throw new Error('Use a valid UTC date range of at most 90 days (from inclusive, to exclusive).');
  }
  const workflow = query.workflow;
  if (workflow !== undefined && (typeof workflow !== 'string' || !workflows.has(workflow))) {
    throw new Error('Invalid usage workflow.');
  }
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString(), workflow };
}

export function createProviderUsageReportRouter(loadReport = getProviderUsageReport) {
  const router = Router();
  router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    let range: ReturnType<typeof usageReportRange>;
    try {
      range = usageReportRange(req.query);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid report range.' });
    }
    try {
      res.json(await loadReport(range.from, range.to, range.workflow));
    } catch {
      console.error('[provider:reporting] Unable to load usage report');
      res.status(503).json({ error: 'Usage report unavailable. Verify the reporting migration and database connection.' });
    }
  });
  return router;
}
export default createProviderUsageReportRouter();
