-- Migration to create daily_challenges table
CREATE TABLE IF NOT EXISTS daily_challenges (
    id SERIAL PRIMARY KEY,
    challenge_date DATE UNIQUE NOT NULL,
    difficulty VARCHAR(20) DEFAULT 'medium',
    property_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on challenge_date for faster lookups
CREATE INDEX IF NOT EXISTS idx_challenge_date ON daily_challenges(challenge_date);

-- Create table to track user completions of daily challenges
CREATE TABLE IF NOT EXISTS user_daily_challenges (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_id INTEGER NOT NULL REFERENCES daily_challenges(id) ON DELETE CASCADE,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    decision VARCHAR(20) NOT NULL,
    points_earned INTEGER NOT NULL,
    time_taken INTEGER NOT NULL,
    UNIQUE(user_id, challenge_id)
);

-- Create indexes for user_daily_challenges
CREATE INDEX IF NOT EXISTS idx_user_challenges ON user_daily_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_challenge_completions ON user_daily_challenges(challenge_id);
