-- Migration: Remove foreign key constraint from webhook_subscriptions
-- The guilds table doesn't exist in the database schema, so this foreign key reference was invalid
-- SQLite doesn't support modifying table constraints directly, so we need to recreate the table

-- Step 1: Create new table without the foreign key constraint
CREATE TABLE IF NOT EXISTS webhook_subscriptions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  resource_type TEXT NOT NULL, -- 'character' or 'fellowship'
  resource_id INTEGER NOT NULL, -- character_id or fellowship_id
  spreadsheet_id TEXT NOT NULL,
  channel_id TEXT NOT NULL, -- Google Drive API channel ID
  resource_id_drive TEXT NOT NULL, -- Google Drive API resourceId
  expiration INTEGER NOT NULL, -- Unix timestamp when subscription expires
  webhook_url TEXT NOT NULL, -- URL to send notifications to
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(guild_id, resource_type, resource_id, spreadsheet_id)
);

-- Step 2: Copy all existing data (if table exists and has data)
-- Note: This will fail silently if webhook_subscriptions doesn't exist, which is fine
-- as the table will be created fresh by the RENAME step
INSERT INTO webhook_subscriptions_new (id, guild_id, resource_type, resource_id, spreadsheet_id, channel_id, resource_id_drive, expiration, webhook_url, created_at)
SELECT id, guild_id, resource_type, resource_id, spreadsheet_id, channel_id, resource_id_drive, expiration, webhook_url, created_at
FROM webhook_subscriptions;

-- Step 3: Drop old table
DROP TABLE IF EXISTS webhook_subscriptions;

-- Step 4: Rename new table to original name
ALTER TABLE webhook_subscriptions_new RENAME TO webhook_subscriptions;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_guild_resource ON webhook_subscriptions(guild_id, resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_expiration ON webhook_subscriptions(expiration);

