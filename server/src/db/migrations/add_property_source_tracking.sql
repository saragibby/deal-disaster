-- Add source tracking columns to property_analyses
ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS source_url VARCHAR(1000);
ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'zillow';

-- Backfill existing rows from zillow_url
UPDATE property_analyses SET source_url = zillow_url, source_type = 'zillow' WHERE source_url IS NULL;
