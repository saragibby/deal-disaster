-- Add slug column to property_analyses for non-sequential, human-readable identifiers
ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS slug VARCHAR(100);

-- Unique per user (same slug can exist for different users, but not the same user)
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_analyses_user_slug
  ON property_analyses(user_id, slug);
