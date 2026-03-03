-- Geocoding Cache
-- Stores address → lat/lng lookups to avoid duplicate Google Geocoding API calls.
-- Addresses don't change coordinates, so entries never expire.

CREATE TABLE IF NOT EXISTS geocoding_cache (
  id            SERIAL PRIMARY KEY,
  address_key   VARCHAR(500) UNIQUE NOT NULL,   -- normalized "123 MAIN ST, SPRINGFIELD, IL 62704"
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  formatted_address TEXT,                        -- canonical address returned by the geocoder
  provider      VARCHAR(50) DEFAULT 'google',    -- which geocoding service was used
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_geocoding_cache_address ON geocoding_cache(address_key);
