// Minimal in-memory sliding-window rate limiter for unauthenticated endpoints.
// Sufficient for single-dyno deployments; swap for a shared store if scaled out.

const buckets = new Map<string, number[]>();

export interface RateLimitOptions {
  key: string;
  max: number;
  windowMs: number;
}

export function isRateLimited({ key, max, windowMs }: RateLimitOptions): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter(ts => now - ts < windowMs);

  if (recent.length >= max) {
    buckets.set(key, recent);
    return true;
  }

  recent.push(now);
  buckets.set(key, recent);
  return false;
}

export function resetRateLimits(): void {
  buckets.clear();
}

// Drop stale buckets periodically so the map doesn't grow unbounded.
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of buckets) {
    const recent = timestamps.filter(ts => now - ts < CLEANUP_INTERVAL_MS);
    if (recent.length === 0) {
      buckets.delete(key);
    } else {
      buckets.set(key, recent);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();
