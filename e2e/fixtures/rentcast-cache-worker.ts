import { pool } from '../../server/src/db/pool.js';
import { getMarketStatistics, getRentEstimate, getRentalComps } from '../../server/src/services/rentCastService.js';

const operation = process.argv[2] ?? 'market';
globalThis.fetch = async () => {
  process.send?.({ type: 'provider' });
  await new Promise(resolve => setTimeout(resolve, 200));
  return Response.json(operation === 'empty' ? [] : operation === 'avm' ? { rent: 2200, rentRangeLow: 2000, rentRangeHigh: 2400 }
    : operation === 'listings' ? [{ price: 2100, bedrooms: 3, owner: { names: ['not-for-cache'] } }]
      : { rentalData: { medianRent: 2200 } });
};
process.on('message', async () => {
  try {
    const property = {
      zpid: '', address: '10 Fixture St', city: 'Example', state: 'NC', zip: '27500',
      price: 200000, bedrooms: 3, bathrooms: 2, sqft: 1500, yearBuilt: 2000,
    };
    const result = operation === 'avm' ? await getRentEstimate(property)
      : operation === 'listings' || operation === 'empty' ? await getRentalComps(property) : await getMarketStatistics('27500');
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
