-- Saved Comparisons table: stores user-saved property comparison sets
CREATE TABLE IF NOT EXISTS saved_comparisons (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  property_slugs TEXT[] NOT NULL,        -- array of property analysis slugs
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saved_comparisons_user ON saved_comparisons(user_id, updated_at DESC);
