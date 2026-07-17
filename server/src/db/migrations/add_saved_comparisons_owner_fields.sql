-- Add owner-aware fields for analyzer-owned persistence while preserving
-- existing user_id and slug behavior.
ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(100) DEFAULT 'asset-dashboard';
ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS platform VARCHAR(50) DEFAULT 'asset-dashboard';
ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

UPDATE property_analyses
SET owner_user_id = user_id
WHERE owner_user_id IS NULL;

UPDATE property_analyses
SET tenant_id = 'asset-dashboard'
WHERE tenant_id IS NULL;

UPDATE property_analyses
SET platform = 'asset-dashboard'
WHERE platform IS NULL;

CREATE INDEX IF NOT EXISTS idx_property_analyses_tenant_owner_slug
  ON property_analyses(tenant_id, owner_user_id, slug);

CREATE INDEX IF NOT EXISTS idx_property_analyses_tenant_owner_created
  ON property_analyses(tenant_id, owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_property_analyses_platform_owner
  ON property_analyses(platform, owner_user_id);

ALTER TABLE saved_comparisons ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(100) DEFAULT 'asset-dashboard';
ALTER TABLE saved_comparisons ADD COLUMN IF NOT EXISTS platform VARCHAR(50) DEFAULT 'asset-dashboard';
ALTER TABLE saved_comparisons ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

UPDATE saved_comparisons
SET owner_user_id = user_id
WHERE owner_user_id IS NULL;

UPDATE saved_comparisons
SET tenant_id = 'asset-dashboard'
WHERE tenant_id IS NULL;

UPDATE saved_comparisons
SET platform = 'asset-dashboard'
WHERE platform IS NULL;

CREATE INDEX IF NOT EXISTS idx_saved_comparisons_tenant_owner_updated
  ON saved_comparisons(tenant_id, owner_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_comparisons_tenant_owner_id
  ON saved_comparisons(tenant_id, owner_user_id, id);

CREATE INDEX IF NOT EXISTS idx_saved_comparisons_platform_owner
  ON saved_comparisons(platform, owner_user_id);
