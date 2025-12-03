-- Initial schema for Mistbot database
-- This migration represents the current schema as of the SQLite conversion

-- Characters table
CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters(user_id);
CREATE INDEX IF NOT EXISTS idx_characters_active ON characters(user_id, is_active);

-- Character themes table
CREATE TABLE IF NOT EXISTS character_themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  theme_order INTEGER NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_themes_character ON character_themes(character_id);

-- Character theme tags table (for both tags and weaknesses)
CREATE TABLE IF NOT EXISTS character_theme_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  is_weakness INTEGER DEFAULT 0,
  FOREIGN KEY (theme_id) REFERENCES character_themes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_theme_tags_theme ON character_theme_tags(theme_id);

-- Character backpack table
CREATE TABLE IF NOT EXISTS character_backpack (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  item TEXT NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_backpack_character ON character_backpack(character_id);

-- Character story tags table
CREATE TABLE IF NOT EXISTS character_story_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_story_tags_character ON character_story_tags(character_id);

-- Character statuses table
CREATE TABLE IF NOT EXISTS character_statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_statuses_character ON character_statuses(character_id);

-- Character burned tags table
CREATE TABLE IF NOT EXISTS character_burned_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_burned_tags_character ON character_burned_tags(character_id);

-- Rolls table
CREATE TABLE IF NOT EXISTS rolls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id TEXT NOT NULL,
  character_id INTEGER,
  scene_id TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  confirmed_by TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_rolls_creator ON rolls(creator_id);
CREATE INDEX IF NOT EXISTS idx_rolls_scene ON rolls(scene_id);
CREATE INDEX IF NOT EXISTS idx_rolls_status ON rolls(status);

-- Roll tags table (for both help and hinder tags)
CREATE TABLE IF NOT EXISTS roll_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  roll_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  tag_type TEXT NOT NULL CHECK(tag_type IN ('help', 'hinder')),
  is_burned INTEGER DEFAULT 0,
  FOREIGN KEY (roll_id) REFERENCES rolls(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_roll_tags_roll ON roll_tags(roll_id);

-- Scenes table
CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Scene tags table
CREATE TABLE IF NOT EXISTS scene_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  tag_type TEXT NOT NULL CHECK(tag_type IN ('tag', 'status', 'limit')),
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scene_tags_scene ON scene_tags(scene_id);
CREATE INDEX IF NOT EXISTS idx_scene_tags_type ON scene_tags(scene_id, tag_type);

