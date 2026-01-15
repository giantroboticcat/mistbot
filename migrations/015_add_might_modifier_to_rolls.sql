-- Add might_modifier column to rolls table
-- This allows additional modifiers from -12 to +12 (default 0) for handling Might
ALTER TABLE rolls ADD COLUMN might_modifier INTEGER DEFAULT 0;