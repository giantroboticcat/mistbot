-- Allow NULL user_id for unassigned characters
-- Unassigned characters can be imported and later claimed by players
-- 
-- SQLite doesn't support ALTER COLUMN to change NOT NULL constraints,
-- so we recreate the table with the correct constraints.

-- Step 1: Create new table with NULL allowed for user_id
CREATE TABLE characters_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,  -- NULL allowed for unassigned characters
  name TEXT NOT NULL,
  is_active INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  google_sheet_url TEXT,
  fellowship_id INTEGER,
  auto_sync INTEGER DEFAULT 0
);

-- Step 2: Copy all data from old table to new table
INSERT INTO characters_new (id, user_id, name, is_active, created_at, updated_at, google_sheet_url, fellowship_id, auto_sync)
SELECT id, user_id, name, is_active, created_at, updated_at, google_sheet_url, fellowship_id, auto_sync
FROM characters;

-- Step 3: Drop old table
DROP TABLE characters;

-- Step 4: Rename new table to original name
ALTER TABLE characters_new RENAME TO characters;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters(user_id);
CREATE INDEX IF NOT EXISTS idx_characters_active ON characters(user_id, is_active);
