import { pool } from '../../server/src/db/pool.js';
import { getMarketStatistics } from '../../server/src/services/rentCastService.js';

globalThis.fetch = async () => {
  process.send?.({ type: 'provider' });
  await new Promise(resolve => setTimeout(resolve, 200));
  return Response.json({ rentalData: { medianRent: 2200 } });
};
process.on('message', async () => {
  try {
    const result = await getMarketStatistics('27500');
    process.send?.({ type: 'result', result });
  } catch {
    process.send?.({ type: 'error' });
    process.exitCode = 1;
  } finally {
    await pool.end();
    process.disconnect();
  }
});
process.send?.({ type: 'ready' });
