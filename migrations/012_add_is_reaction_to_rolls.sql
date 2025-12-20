-- Add is_reaction column to rolls table
-- This identifies whether a roll is a reaction roll (true) or action roll (false)
-- Reaction rolls have different outcomes when executed

ALTER TABLE rolls ADD COLUMN is_reaction INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_rolls_is_reaction ON rolls(is_reaction);

