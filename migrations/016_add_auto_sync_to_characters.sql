-- Add auto_sync column to characters table
-- This enables automatic syncing of character data to Google Sheets when changes are made
ALTER TABLE characters ADD COLUMN auto_sync INTEGER DEFAULT 0;

