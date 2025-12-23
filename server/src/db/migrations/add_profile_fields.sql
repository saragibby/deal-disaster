-- Migration to add profile fields to existing users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS sms_opt_in BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS email_newsletter_opt_in BOOLEAN DEFAULT FALSE;
