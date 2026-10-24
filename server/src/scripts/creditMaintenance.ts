import { pool } from '../db/pool.js';
import { runCreditMaintenance } from '../services/analysisMeteringService.js';

async function main() {
  try {
    const result = await runCreditMaintenance();
    console.info(
      `[credits] Refunded ${result.staleRefunded} stale reservation(s); `
      + `expired ${result.expiredLots} lot(s) totaling ${result.expiredCents}¢`,
    );
  } catch (error) {
    console.error('[credits] Maintenance failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
