-- Migration to add username field to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE;

-- Create index for faster username lookups
CREATE INDEX IF NOT EXISTS idx_username ON users(username);
