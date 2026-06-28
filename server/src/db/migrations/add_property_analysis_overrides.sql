-- Persist user-made adjustments (operating costs, revenue, furniture/appliances,
-- selected strategy, and changed params) on a saved analysis.
-- Run: psql "$DATABASE_URL" -f server/src/db/migrations/add_property_analysis_overrides.sql
ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS user_overrides JSONB;
