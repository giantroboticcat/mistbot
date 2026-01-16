-- Add webhook_subscriptions table to track Google Drive API push notifications
-- This enables receiving notifications when Google Sheets change
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
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
  FOREIGN KEY (guild_id) REFERENCES guilds(id),
  UNIQUE(guild_id, resource_type, resource_id, spreadsheet_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_guild_resource ON webhook_subscriptions(guild_id, resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_expiration ON webhook_subscriptions(expiration);

