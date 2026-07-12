-- Add opaque, non-guessable public identifiers for shared property analyses.
ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS public_share_id VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_analyses_public_share_id
ON property_analyses(public_share_id)
WHERE public_share_id IS NOT NULL;
