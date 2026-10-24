-- Analyzer daily limits + prepaid credits. Keep in sync with ../analysisCreditsSchema.ts.
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone_updated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer_id
  ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS credit_lots (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('purchase', 'admin_grant')),
  original_cents INTEGER NOT NULL CHECK (original_cents > 0),
  remaining_cents INTEGER NOT NULL CHECK (remaining_cents >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_lots_user_id
  ON credit_lots(user_id, expires_at) WHERE remaining_cents > 0;

CREATE TABLE IF NOT EXISTS analysis_usage_events (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  usage_date DATE NOT NULL,
  charge_type TEXT NOT NULL CHECK (charge_type IN ('free', 'credit', 'exempt')),
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'committed', 'refunded')),
  would_block BOOLEAN NOT NULL DEFAULT FALSE,
  refund_reason TEXT,
  property_slug TEXT,
  property_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_analysis_usage_events_user_id
  ON analysis_usage_events(user_id, usage_date);
CREATE INDEX IF NOT EXISTS idx_analysis_usage_events_status
  ON analysis_usage_events(status, created_at) WHERE status = 'reserved';

CREATE TABLE IF NOT EXISTS credit_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lot_id BIGINT REFERENCES credit_lots(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN
    ('purchase', 'admin_grant', 'usage', 'usage_refund', 'expiration', 'stripe_refund')),
  amount_cents INTEGER NOT NULL,
  usage_event_id UUID REFERENCES analysis_usage_events(id) ON DELETE SET NULL,
  description TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id ON credit_ledger(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_usage_event_id
  ON credit_ledger(usage_event_id) WHERE usage_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS stripe_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
