ALTER TABLE property_analyses
  ADD COLUMN IF NOT EXISTS property_records JSONB;
