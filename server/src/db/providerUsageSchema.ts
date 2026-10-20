export const PROVIDER_USAGE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS provider_usage_events (
    request_id UUID PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL,
    workflow TEXT NOT NULL,
    outcome TEXT NOT NULL,
    summary JSONB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_provider_usage_events_occurred_at
    ON provider_usage_events(occurred_at);
`;
