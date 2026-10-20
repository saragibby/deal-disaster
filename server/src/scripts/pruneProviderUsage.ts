import { pool } from '../db/pool.js';
import { pruneProviderUsage } from '../services/providerUsageReportingService.js';

async function main() {
  try {
    let total = 0;
    let count: number;
    do {
      count = await pruneProviderUsage(pool);
      total += count;
    } while (count === 10000);
    console.info('[provider:reporting] Expired usage records removed:', total);
  } catch {
    console.error('[provider:reporting] Retention cleanup failed');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
