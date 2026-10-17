export const RENTCAST_MARKET_CACHE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS rentcast_market_cache (
    cache_key TEXT PRIMARY KEY,
    payload JSONB,
    fetched_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    lease_owner UUID,
    lease_expires_at TIMESTAMPTZ,
    retry_after TIMESTAMPTZ,
    CHECK ((payload IS NULL AND fetched_at IS NULL AND expires_at IS NULL)
      OR (payload IS NOT NULL AND fetched_at IS NOT NULL AND expires_at IS NOT NULL AND expires_at > fetched_at))
  );
  CREATE INDEX IF NOT EXISTS idx_rentcast_market_cache_expires_at
    ON rentcast_market_cache(expires_at);
`;
