-- Normalize saved comparison membership to stable property analysis IDs while
-- preserving saved_comparisons.property_slugs for API compatibility.
CREATE TABLE IF NOT EXISTS saved_comparison_members (
  comparison_id INTEGER NOT NULL REFERENCES saved_comparisons(id) ON DELETE CASCADE,
  analysis_id INTEGER NOT NULL REFERENCES property_analyses(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 1 AND position <= 6),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (comparison_id, analysis_id),
  UNIQUE (comparison_id, position)
);

INSERT INTO saved_comparison_members (comparison_id, analysis_id, position)
SELECT sc.id, pa.id, slug_position.ordinality::int
FROM saved_comparisons sc
CROSS JOIN LATERAL unnest(sc.property_slugs) WITH ORDINALITY AS slug_position(slug, ordinality)
JOIN property_analyses pa
  ON COALESCE(pa.tenant_id, 'asset-dashboard') = COALESCE(sc.tenant_id, 'asset-dashboard')
 AND COALESCE(pa.owner_user_id, pa.user_id) = COALESCE(sc.owner_user_id, sc.user_id)
 AND pa.slug = slug_position.slug
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_saved_comparison_members_analysis
  ON saved_comparison_members(analysis_id);
