-- Add quest column to character_themes table
-- Quests are usually a few sentences in length, so TEXT is appropriate

ALTER TABLE character_themes ADD COLUMN quest TEXT;

