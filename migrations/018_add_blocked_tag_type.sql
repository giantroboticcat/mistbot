-- Migration: Add 'blocked' tag type to scene_tags
-- This migration updates the CHECK constraint on scene_tags.tag_type to include 'blocked'

-- SQLite doesn't support modifying CHECK constraints, so we need to recreate the table
-- Step 1: Create new table with updated constraint
CREATE TABLE IF NOT EXISTS scene_tags_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  tag_type TEXT NOT NULL CHECK(tag_type IN ('tag', 'status', 'limit', 'blocked')),
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
);

-- Step 2: Copy all existing data
INSERT INTO scene_tags_new (id, scene_id, tag, tag_type)
SELECT id, scene_id, tag, tag_type
FROM scene_tags;

-- Step 3: Drop old table
DROP TABLE scene_tags;

-- Step 4: Rename new table to original name
ALTER TABLE scene_tags_new RENAME TO scene_tags;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_scene_tags_scene ON scene_tags(scene_id);
CREATE INDEX IF NOT EXISTS idx_scene_tags_type ON scene_tags(scene_id, tag_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scene_tags_unique ON scene_tags(scene_id, tag, tag_type);

