-- Add email notification preference columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_insights_email_opt_in BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_insights_email_opt_in BOOLEAN DEFAULT FALSE;
