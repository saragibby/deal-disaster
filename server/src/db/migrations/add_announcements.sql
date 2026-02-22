-- Migration: Create announcements table for admin-managed news messages
-- Run: psql "$DATABASE_URL" -f server/src/db/migrations/add_announcements.sql

CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'news' CHECK (type IN ('news', 'update', 'tip')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed with a default welcome announcement
INSERT INTO announcements (title, content, type, is_active)
VALUES (
  'Welcome to Passive Income Club!',
  'We''re excited to launch our gaming platform. Start with Deal or Disaster, our flagship foreclosure investing game, and stay tuned for more games coming soon!',
  'news',
  TRUE
);
