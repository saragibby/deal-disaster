CREATE TABLE IF NOT EXISTS analysis_scenarios (
  id SERIAL PRIMARY KEY,
  analysis_id INTEGER NOT NULL REFERENCES property_analyses(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  overrides JSONB NOT NULL,
  metrics JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_analysis_scenarios_analysis_id
  ON analysis_scenarios(analysis_id);
