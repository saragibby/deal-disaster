/**
 * Xome Foreclosure Routes
 *
 * POST  /api/xome/search         – search nearby foreclosure auctions
 * GET   /api/xome/market-trends   – market trends by postal code
 *
 * The Xome listing/search endpoint ignores location filters and always returns
 * all US auction listings (~7 000).  We work around this by caching the full
 * result set in memory and filtering by Haversine distance on the server.
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

const router = Router();

const XOME_API_KEY = () => process.env.XOME_API_KEY || '';
const XOME_API_URL = () =>
  process.env.XOME_API_URL || 'https://apis.xome.com/auctions/listing/v1/listing/search';

/* ------------------------------------------------------------------ */
/*  In-memory Xome listing cache                                       */
/* ------------------------------------------------------------------ */
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/* Market trends cache – keyed by zip, data changes monthly at most */
const TRENDS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const trendsCache = new Map<string, { data: any; expiresAt: number }>();

interface CachedData {
  listings: any[];
  fetchedAt: number;
}

let cache: CachedData | null = null;
let fetchInProgress: Promise<any[]> | null = null;

async function fetchAllListings(): Promise<any[]> {
  const apiKey = XOME_API_KEY();
  if (!apiKey) throw new Error('Xome API not configured');

  const response = await fetch(XOME_API_URL(), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: apiKey,
    },
    body: JSON.stringify({ searchCriteria: {}, offSet: 0, limit: 10000 }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Xome API ${response.status}: ${text.slice(0, 200)}`);
  }

  const json: any = await response.json();
  return json?.data?.listings ?? [];
}

async function getCachedListings(): Promise<any[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.listings;
  }

  // Deduplicate concurrent requests during a cache refresh
  if (fetchInProgress) return fetchInProgress;

  fetchInProgress = fetchAllListings()
    .then((listings) => {
      cache = { listings, fetchedAt: Date.now() };
      fetchInProgress = null;
      console.log(`[xome] Cached ${listings.length} listings`);
      return listings;
    })
    .catch((err) => {
      fetchInProgress = null;
      // Return stale cache if available
      if (cache) {
        console.warn('[xome] Refresh failed, using stale cache:', err.message);
        return cache.listings;
      }
      throw err;
    });

  return fetchInProgress;
}

/* ------------------------------------------------------------------ */
/*  Haversine distance (miles)                                         */
/* ------------------------------------------------------------------ */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ------------------------------------------------------------------ */
/*  POST /search                                                       */
/* ------------------------------------------------------------------ */
router.post('/search', authenticateToken, async (req: AuthRequest, res: Response) => {
  const apiKey = XOME_API_KEY();
  if (!apiKey) {
    res.status(503).json({ error: 'Xome API not configured' });
    return;
  }

  const { latitude, longitude, radius = 50, limit = 50 } = req.body;

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    res.status(400).json({ error: 'latitude and longitude are required numbers' });
    return;
  }

  try {
    const all = await getCachedListings();

    const nearby = all
      .map((l) => ({
        ...l,
        _distance: haversine(latitude, longitude, l.latitude, l.longitude),
      }))
      .filter((l) => l._distance <= radius)
      .sort((a, b) => a._distance - b._distance)
      .slice(0, limit);

    res.json({
      totalRecords: nearby.length,
      data: { listings: nearby },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[xome/search]', message);
    res.status(500).json({ error: message });
  }
});

// GET /market-trends – Xome market trends by zip code
router.get('/market-trends', authenticateToken, async (req: AuthRequest, res: Response) => {
  const apiKey = XOME_API_KEY();
  if (!apiKey) {
    res.status(503).json({ error: 'Xome API not configured' });
    return;
  }

  const postalCode = req.query.postalCode as string | undefined;
  if (!postalCode || !/^\d{5}$/.test(postalCode)) {
    res.status(400).json({ error: "Missing or invalid 'postalCode' query parameter" });
    return;
  }

  const url = `https://apis.xome.com/auctions/listing/v1/MarketTrends?postalCode=${postalCode}`;

  // Check cache first
  const cached = trendsCache.get(postalCode);
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`[xome/market-trends] Cache hit for ${postalCode}`);
    res.json(cached.data);
    return;
  }

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        authorization: apiKey,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn('[xome/market-trends] Xome API error:', response.status, text.slice(0, 500));
      res.status(response.status).json({ error: text });
      return;
    }

    const data = await response.json();
    trendsCache.set(postalCode, { data, expiresAt: Date.now() + TRENDS_CACHE_TTL_MS });
    console.log(`[xome/market-trends] Cached response for ${postalCode} (7d TTL)`);
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[xome/market-trends]', message);
    res.status(500).json({ error: message });
  }
});

/* ------------------------------------------------------------------ */
/*  Pre-warm listing cache on import so the first user request is fast  */
/* ------------------------------------------------------------------ */
if (XOME_API_KEY()) {
  getCachedListings().catch((err) =>
    console.warn('[xome] Cache pre-warm failed:', err.message),
  );
}

export default router;
