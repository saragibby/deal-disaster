-- Durable provider cache entries for property analyzer provider responses.
-- This table intentionally stores provider response payloads and cache metadata only:
-- no credentials, raw provider request bodies, user-owned analysis rows, or user ids.

CREATE TABLE IF NOT EXISTS provider_cache_entries (
  id BIGSERIAL PRIMARY KEY,
  provider VARCHAR(100) NOT NULL,
  cache_profile VARCHAR(100) NOT NULL DEFAULT 'default',
  normalized_key TEXT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  stale_if_error_expires_at TIMESTAMPTZ,
  freshness_ms BIGINT,
  stale_if_error_ms BIGINT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  source_platform VARCHAR(100) NOT NULL,
  credential_scope VARCHAR(20) NOT NULL,
  cache_scope VARCHAR(20) NOT NULL,
  scope_key_hash CHAR(64) NOT NULL,
  cache_sharing VARCHAR(20) NOT NULL,
  cross_product_reuse VARCHAR(20) NOT NULL,
  durable_cache_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  terms_reuse_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  terms_retention_class VARCHAR(100) NOT NULL DEFAULT 'provider-response',
  terms_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_provider_cache_request_hash
    CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT chk_provider_cache_scope_key_hash
    CHECK (scope_key_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT chk_provider_cache_credential_scope
    CHECK (credential_scope IN ('none', 'platform', 'tenant', 'owner')),
  CONSTRAINT chk_provider_cache_cache_scope
    CHECK (cache_scope IN ('global', 'platform', 'tenant', 'owner')),
  CONSTRAINT chk_provider_cache_sharing
    CHECK (cache_sharing IN ('global', 'platform', 'tenant', 'owner', 'disabled')),
  CONSTRAINT chk_provider_cache_cross_product_reuse
    CHECK (cross_product_reuse IN ('allowed', 'forbidden')),
  CONSTRAINT chk_provider_cache_freshness_ms
    CHECK (freshness_ms IS NULL OR freshness_ms >= 0),
  CONSTRAINT chk_provider_cache_stale_if_error_ms
    CHECK (stale_if_error_ms IS NULL OR stale_if_error_ms >= 0),
  CONSTRAINT chk_provider_cache_expires_at
    CHECK (expires_at IS NULL OR expires_at >= fetched_at),
  CONSTRAINT chk_provider_cache_stale_if_error_expires_at
    CHECK (
      stale_if_error_expires_at IS NULL
      OR expires_at IS NULL
      OR stale_if_error_expires_at >= expires_at
    ),
  CONSTRAINT chk_provider_cache_terms_metadata_object
    CHECK (jsonb_typeof(terms_metadata) = 'object'),
  CONSTRAINT chk_provider_cache_no_sensitive_payload_keys
    CHECK (
      NOT (
        payload ?| ARRAY[
          'credential',
          'credentials',
          'apiKey',
          'api_key',
          'access_token',
          'refresh_token',
          'password',
          'secret',
          'userAnalysis',
          'analysisResults',
          'propertyAnalysisId'
        ]
      )
    ),
  CONSTRAINT chk_provider_cache_no_sensitive_terms_keys
    CHECK (
      NOT (
        terms_metadata ?| ARRAY[
          'credential',
          'credentials',
          'apiKey',
          'api_key',
          'access_token',
          'refresh_token',
          'password',
          'secret',
          'userAnalysis',
          'analysisResults',
          'propertyAnalysisId',
          'userId'
        ]
      )
    )
);

COMMENT ON TABLE provider_cache_entries IS
  'Durable provider cache for provider-owned response payloads only; do not store credentials, raw requests, user ids, or property analysis records.';
COMMENT ON COLUMN provider_cache_entries.normalized_key IS
  'Canonical provider cache key input, normalized before storage.';
COMMENT ON COLUMN provider_cache_entries.request_hash IS
  'SHA-256 hash of the normalized request shape; raw requests and credentials are not stored.';
COMMENT ON COLUMN provider_cache_entries.payload IS
  'Provider response payload. Must not include credentials or user-owned analysis data.';
COMMENT ON COLUMN provider_cache_entries.stale_if_error_expires_at IS
  'Latest timestamp this response may be served when a provider refresh fails.';
COMMENT ON COLUMN provider_cache_entries.scope_key_hash IS
  'Hash of the non-secret cache namespace for platform/tenant/owner scopes; never store raw tenant, owner, or credential identifiers.';
COMMENT ON COLUMN provider_cache_entries.terms_metadata IS
  'Terms-sensitive provider metadata only, such as source terms tag/version and attribution requirements.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_cache_entries_lookup_unique
ON provider_cache_entries (
  provider,
  source_platform,
  credential_scope,
  cache_scope,
  scope_key_hash,
  cache_profile,
  normalized_key,
  request_hash,
  schema_version
);

CREATE INDEX IF NOT EXISTS idx_provider_cache_entries_lookup
ON provider_cache_entries (
  provider,
  normalized_key,
  credential_scope,
  cache_scope,
  source_platform
);

CREATE INDEX IF NOT EXISTS idx_provider_cache_entries_freshness
ON provider_cache_entries (
  provider,
  credential_scope,
  cache_scope,
  expires_at,
  stale_if_error_expires_at
);

CREATE INDEX IF NOT EXISTS idx_provider_cache_entries_request_hash
ON provider_cache_entries (provider, request_hash);
