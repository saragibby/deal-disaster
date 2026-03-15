-- Area Market Data: caches housing market & rental market data per area.
-- Shared across all users; refreshed weekly; historical rows retained.
CREATE TABLE IF NOT EXISTS area_market_data (
  id SERIAL PRIMARY KEY,
  area_key VARCHAR(255) NOT NULL,                -- normalized "city, state" key
  area_name VARCHAR(255) NOT NULL,               -- display name from API
  housing_market JSONB,                          -- /housing_market response
  rental_market JSONB,                           -- /rental_market response
  fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Fast lookup: latest data for a given area
CREATE INDEX IF NOT EXISTS idx_area_market_data_area_key ON area_market_data(area_key, fetched_at DESC);
