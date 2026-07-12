-- Backfill existing analyzer persistence into the default Asset Dashboard
-- ownership model. This preserves user_id/slug behavior and verifies that
-- the backfill is row-count preserving and idempotent.
DO $$
DECLARE
  property_count_before INTEGER;
  property_count_after INTEGER;
  property_missing_ownership INTEGER;
  comparison_count_before INTEGER;
  comparison_count_after INTEGER;
  comparison_missing_ownership INTEGER;
BEGIN
  SELECT COUNT(*)::int INTO property_count_before FROM property_analyses;

  UPDATE property_analyses
  SET
    tenant_id = COALESCE(tenant_id, 'asset-dashboard'),
    platform = COALESCE(platform, 'asset-dashboard'),
    owner_user_id = COALESCE(owner_user_id, user_id)
  WHERE tenant_id IS NULL
     OR platform IS NULL
     OR owner_user_id IS NULL;

  SELECT COUNT(*)::int INTO property_count_after FROM property_analyses;

  IF property_count_after <> property_count_before THEN
    RAISE EXCEPTION
      'Analyzer ownership backfill changed property_analyses row count from % to %',
      property_count_before,
      property_count_after;
  END IF;

  SELECT COUNT(*)::int INTO property_missing_ownership
  FROM property_analyses
  WHERE tenant_id IS NULL
     OR platform IS NULL
     OR owner_user_id IS NULL;

  IF property_missing_ownership > 0 THEN
    RAISE EXCEPTION
      'Analyzer ownership backfill left % property_analyses rows without tenant, platform, or owner user fields',
      property_missing_ownership;
  END IF;

  SELECT COUNT(*)::int INTO comparison_count_before FROM saved_comparisons;

  UPDATE saved_comparisons
  SET
    tenant_id = COALESCE(tenant_id, 'asset-dashboard'),
    platform = COALESCE(platform, 'asset-dashboard'),
    owner_user_id = COALESCE(owner_user_id, user_id)
  WHERE tenant_id IS NULL
     OR platform IS NULL
     OR owner_user_id IS NULL;

  SELECT COUNT(*)::int INTO comparison_count_after FROM saved_comparisons;

  IF comparison_count_after <> comparison_count_before THEN
    RAISE EXCEPTION
      'Analyzer ownership backfill changed saved_comparisons row count from % to %',
      comparison_count_before,
      comparison_count_after;
  END IF;

  SELECT COUNT(*)::int INTO comparison_missing_ownership
  FROM saved_comparisons
  WHERE tenant_id IS NULL
     OR platform IS NULL
     OR owner_user_id IS NULL;

  IF comparison_missing_ownership > 0 THEN
    RAISE EXCEPTION
      'Analyzer ownership backfill left % saved_comparisons rows without tenant, platform, or owner user fields',
      comparison_missing_ownership;
  END IF;
END $$;
