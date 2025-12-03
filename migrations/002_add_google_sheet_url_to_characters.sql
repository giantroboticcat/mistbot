-- Migration: add google sheet url to characters
-- Created: 2025-12-03T03:19:17.381Z

-- Add google_sheet_url column to characters table to store per-character sheet URLs
ALTER TABLE characters ADD COLUMN google_sheet_url TEXT;
