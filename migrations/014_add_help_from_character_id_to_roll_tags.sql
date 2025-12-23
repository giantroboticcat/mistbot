-- Add help_from_character_id and help_from_user_id to roll_tags to track which character a help tag came from
-- This is used to identify help action tags (tags from other players) which cannot be burned
-- Both character_id and user_id are needed to uniquely identify a character
ALTER TABLE roll_tags ADD COLUMN help_from_character_id INTEGER;
ALTER TABLE roll_tags ADD COLUMN help_from_user_id TEXT;

