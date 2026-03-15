-- Add sharing capability to property analyses
ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT FALSE;
