-- Add fellowships support
-- Fellowships are shared themes that multiple characters can belong to

-- Fellowships table
CREATE TABLE IF NOT EXISTS fellowships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_fellowships_name ON fellowships(name);

-- Fellowship tags table (for both tags and weaknesses)
CREATE TABLE IF NOT EXISTS fellowship_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fellowship_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  is_weakness INTEGER DEFAULT 0,
  FOREIGN KEY (fellowship_id) REFERENCES fellowships(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fellowship_tags_fellowship ON fellowship_tags(fellowship_id);

-- Add fellowship_id to characters table (one fellowship per character)
ALTER TABLE characters ADD COLUMN fellowship_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_characters_fellowship ON characters(fellowship_id);

