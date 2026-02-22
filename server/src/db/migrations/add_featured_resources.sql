-- Migration: Add is_featured column to resources table
ALTER TABLE resources ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark the two key resources as featured
UPDATE resources SET is_featured = TRUE, sort_order = 0 WHERE title = 'How Many Assets Hub';
UPDATE resources SET is_featured = TRUE, sort_order = 0 WHERE title = 'Passive Income Club (Skool)';
