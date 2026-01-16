-- Add improvements column to character_themes table
-- Tracks theme improvements earned from weakness tags used in rolls
ALTER TABLE character_themes ADD COLUMN improvements INTEGER DEFAULT 0;

