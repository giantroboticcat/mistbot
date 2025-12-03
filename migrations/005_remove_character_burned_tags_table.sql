-- Migration: remove character burned tags table
-- Created: 2025-12-03T03:31:49.118Z

-- Remove the character_burned_tags table
-- Burned status is now stored as a property on character_theme_tags and character_themes
DROP TABLE IF EXISTS character_burned_tags;
