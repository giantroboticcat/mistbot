-- Add reaction_to_roll_id column to rolls table
-- This links a reaction roll to the original roll it's reacting to
-- If NULL, this is a regular roll (not a reaction)

ALTER TABLE rolls ADD COLUMN reaction_to_roll_id INTEGER REFERENCES rolls(id);

CREATE INDEX IF NOT EXISTS idx_rolls_reaction_to ON rolls(reaction_to_roll_id);

