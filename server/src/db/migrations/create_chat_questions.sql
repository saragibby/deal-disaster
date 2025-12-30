-- Create table to track chat questions for analytics
CREATE TABLE IF NOT EXISTS chat_questions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  response_preview TEXT,
  asked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  session_id TEXT,
  
  -- Index for analytics queries
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for efficient querying by date
CREATE INDEX idx_chat_questions_asked_at ON chat_questions(asked_at DESC);

-- Create index for user analytics
CREATE INDEX idx_chat_questions_user_id ON chat_questions(user_id);
