-- Refactor roll_tags to use foreign key relationships instead of string tags
-- This migration converts tag strings (e.g., "theme:Tinkerer") to foreign key references

-- Step 1: Create new roll_tags table with polymorphic foreign keys
CREATE TABLE roll_tags_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  roll_id INTEGER NOT NULL,
  tag_type TEXT NOT NULL CHECK(tag_type IN ('help', 'hinder')),
  is_burned INTEGER DEFAULT 0,
  help_from_character_id INTEGER,
  
  -- Polymorphic relationship: single parent_id with parent_type
  parent_id INTEGER NOT NULL,
  parent_type TEXT NOT NULL CHECK(parent_type IN (
    'character_theme',
    'character_theme_tag',
    'character_backpack',
    'character_story_tag',
    'character_status',
    'scene_tag',
    'fellowship_tag'
  )),
  
  FOREIGN KEY (roll_id) REFERENCES rolls(id) ON DELETE CASCADE,
  FOREIGN KEY (help_from_character_id) REFERENCES characters(id) ON DELETE SET NULL
);

-- Step 2: Migrate existing data
-- This is complex because we need to parse tag strings and find matching entities
-- We'll do this in a transaction to ensure data integrity

-- Note: This migration assumes we can match tags by name. 
-- For themes, we match by character_id + name
-- For theme_tags, we match by theme_id + tag name
-- For backpack, we match by character_id + item
-- For story_tags, we match by character_id + tag
-- For statuses, we match by character_id + status (parsing the status name from tempStatus:status-name)
-- For scene_tags, we match by scene_id + tag

-- Migrate theme: tags
INSERT INTO roll_tags_new (roll_id, tag_type, is_burned, parent_id, parent_type)
SELECT 
  rt.roll_id,
  rt.tag_type,
  rt.is_burned,
  ct.id,
  'character_theme'
FROM roll_tags rt
JOIN rolls r ON rt.roll_id = r.id
JOIN characters c ON r.character_id = c.id
JOIN character_themes ct ON ct.character_id = c.id AND ct.name = REPLACE(rt.tag, 'theme:', '')
WHERE rt.tag LIKE 'theme:%';

-- Migrate tag: tags (theme tags that are not weaknesses)
INSERT INTO roll_tags_new (roll_id, tag_type, is_burned, parent_id, parent_type)
SELECT 
  rt.roll_id,
  rt.tag_type,
  rt.is_burned,
  ctt.id,
  'character_theme_tag'
FROM roll_tags rt
JOIN rolls r ON rt.roll_id = r.id
JOIN characters c ON r.character_id = c.id
JOIN character_themes ct ON ct.character_id = c.id
JOIN character_theme_tags ctt ON ctt.theme_id = ct.id 
  AND ctt.tag = REPLACE(rt.tag, 'tag:', '')
  AND ctt.is_weakness = 0
WHERE rt.tag LIKE 'tag:%';

-- Migrate weakness: tags (theme tags that are weaknesses)
INSERT INTO roll_tags_new (roll_id, tag_type, is_burned, parent_id, parent_type)
SELECT 
  rt.roll_id,
  rt.tag_type,
  rt.is_burned,
  ctt.id,
  'character_theme_tag'
FROM roll_tags rt
JOIN rolls r ON rt.roll_id = r.id
JOIN characters c ON r.character_id = c.id
JOIN character_themes ct ON ct.character_id = c.id
JOIN character_theme_tags ctt ON ctt.theme_id = ct.id 
  AND ctt.tag = REPLACE(rt.tag, 'weakness:', '')
  AND ctt.is_weakness = 1
WHERE rt.tag LIKE 'weakness:%';

-- Migrate backpack: tags
INSERT INTO roll_tags_new (roll_id, tag_type, is_burned, parent_id, parent_type)
SELECT 
  rt.roll_id,
  rt.tag_type,
  rt.is_burned,
  cb.id,
  'character_backpack'
FROM roll_tags rt
JOIN rolls r ON rt.roll_id = r.id
JOIN characters c ON r.character_id = c.id
JOIN character_backpack cb ON cb.character_id = c.id 
  AND cb.item = REPLACE(rt.tag, 'backpack:', '')
WHERE rt.tag LIKE 'backpack:%';

-- Migrate story: tags
INSERT INTO roll_tags_new (roll_id, tag_type, is_burned, parent_id, parent_type)
SELECT 
  rt.roll_id,
  rt.tag_type,
  rt.is_burned,
  cst.id,
  'character_story_tag'
FROM roll_tags rt
JOIN rolls r ON rt.roll_id = r.id
JOIN characters c ON r.character_id = c.id
JOIN character_story_tags cst ON cst.character_id = c.id 
  AND cst.tag = REPLACE(rt.tag, 'story:', '')
WHERE rt.tag LIKE 'story:%';

-- Migrate tempStatus: tags
-- Note: tempStatus format is "status-name" or "status-name-power", we need to match by base status name
-- Match where the status name is a prefix of the tag value (without tempStatus: prefix)
-- and the remainder is either empty or starts with '-' followed by a digit
INSERT INTO roll_tags_new (roll_id, tag_type, is_burned, parent_id, parent_type)
SELECT DISTINCT
  rt.roll_id,
  rt.tag_type,
  rt.is_burned,
  cs.id,
  'character_status'
FROM roll_tags rt
JOIN rolls r ON rt.roll_id = r.id
JOIN characters c ON r.character_id = c.id
JOIN character_statuses cs ON cs.character_id = c.id
WHERE rt.tag LIKE 'tempStatus:%'
  AND (
    REPLACE(rt.tag, 'tempStatus:', '') = cs.status
    OR REPLACE(rt.tag, 'tempStatus:', '') LIKE cs.status || '-%'
  )
  AND (
    -- Either exact match, or the part after status name is a dash followed by digits
    LENGTH(REPLACE(rt.tag, 'tempStatus:', '')) = LENGTH(cs.status)
    OR SUBSTR(REPLACE(rt.tag, 'tempStatus:', ''), LENGTH(cs.status) + 1, 1) = '-'
  );

-- Migrate sceneTag: tags
INSERT INTO roll_tags_new (roll_id, tag_type, is_burned, parent_id, parent_type)
SELECT 
  rt.roll_id,
  rt.tag_type,
  rt.is_burned,
  st.id,
  'scene_tag'
FROM roll_tags rt
JOIN rolls r ON rt.roll_id = r.id
JOIN scene_tags st ON st.scene_id = r.scene_id 
  AND st.tag = REPLACE(rt.tag, 'sceneTag:', '')
  AND st.tag_type = 'tag'
WHERE rt.tag LIKE 'sceneTag:%';

-- Migrate sceneStatus: tags
INSERT INTO roll_tags_new (roll_id, tag_type, is_burned, parent_id, parent_type)
SELECT 
  rt.roll_id,
  rt.tag_type,
  rt.is_burned,
  st.id,
  'scene_tag'
FROM roll_tags rt
JOIN rolls r ON rt.roll_id = r.id
JOIN scene_tags st ON st.scene_id = r.scene_id 
  AND st.tag = REPLACE(rt.tag, 'sceneStatus:', '')
  AND st.tag_type = 'status'
WHERE rt.tag LIKE 'sceneStatus:%';

-- Migrate fellowship: tags (fellowship tags that are not weaknesses)
INSERT INTO roll_tags_new (roll_id, tag_type, is_burned, parent_id, parent_type)
SELECT 
  rt.roll_id,
  rt.tag_type,
  rt.is_burned,
  ft.id,
  'fellowship_tag'
FROM roll_tags rt
JOIN rolls r ON rt.roll_id = r.id
JOIN characters c ON r.character_id = c.id
JOIN fellowships f ON f.id = c.fellowship_id
JOIN fellowship_tags ft ON ft.fellowship_id = f.id 
  AND ft.tag = REPLACE(rt.tag, 'fellowship:', '')
  AND ft.is_weakness = 0
WHERE rt.tag LIKE 'fellowship:%';

-- Migrate fellowshipWeakness: tags (fellowship tags that are weaknesses)
INSERT INTO roll_tags_new (roll_id, tag_type, is_burned, parent_id, parent_type)
SELECT 
  rt.roll_id,
  rt.tag_type,
  rt.is_burned,
  ft.id,
  'fellowship_tag'
FROM roll_tags rt
JOIN rolls r ON rt.roll_id = r.id
JOIN characters c ON r.character_id = c.id
JOIN fellowships f ON f.id = c.fellowship_id
JOIN fellowship_tags ft ON ft.fellowship_id = f.id 
  AND ft.tag = REPLACE(rt.tag, 'fellowshipWeakness:', '')
  AND ft.is_weakness = 1
WHERE rt.tag LIKE 'fellowshipWeakness:%';

-- Step 3: Update sqlite_sequence
DELETE FROM sqlite_sequence WHERE name = 'roll_tags';
INSERT INTO sqlite_sequence (name, seq)
SELECT 'roll_tags', COALESCE(MAX(id), 0) FROM roll_tags_new;

-- Step 4: Drop old table and rename new one
DROP TABLE roll_tags;
ALTER TABLE roll_tags_new RENAME TO roll_tags;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_roll_tags_roll ON roll_tags(roll_id);
CREATE INDEX IF NOT EXISTS idx_roll_tags_parent ON roll_tags(parent_type, parent_id);
CREATE INDEX IF NOT EXISTS idx_roll_tags_help_from_character ON roll_tags(help_from_character_id);

