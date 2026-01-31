-- Add read status to feedback table
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT FALSE;

-- Create index for faster queries on unread feedback
CREATE INDEX IF NOT EXISTS idx_feedback_read ON feedback(read) WHERE read = FALSE;
