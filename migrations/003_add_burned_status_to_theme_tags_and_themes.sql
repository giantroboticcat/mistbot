-- Migration: add burned status to theme tags and themes
-- Created: 2025-12-03T03:29:36.804Z

-- Add is_burned column to character_theme_tags
-- This allows tags to have burned status as a property
ALTER TABLE character_theme_tags ADD COLUMN is_burned INTEGER DEFAULT 0;

-- Add is_burned column to character_themes
-- This allows theme names (which are also tags) to be burned
ALTER TABLE character_themes ADD COLUMN is_burned INTEGER DEFAULT 0;

-- Note: character_burned_tags table will be removed in a future migration
-- after data is migrated to the new structure
