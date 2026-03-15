-- Property Analyses table: stores user-saved property analysis results
CREATE TABLE IF NOT EXISTS property_analyses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug VARCHAR(100) NOT NULL,
  zillow_url VARCHAR(1000) NOT NULL,
  zpid VARCHAR(50),
  property_data JSONB NOT NULL,         -- full fetched property details
  analysis_params JSONB NOT NULL,       -- user's input params (down payment %, rate, etc.)
  analysis_results JSONB NOT NULL,      -- computed metrics (cash flow, ROI, tax savings)
  rental_comps JSONB,                   -- comp data
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_property_analyses_user ON property_analyses(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_analyses_zpid ON property_analyses(zpid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_analyses_user_slug ON property_analyses(user_id, slug);
