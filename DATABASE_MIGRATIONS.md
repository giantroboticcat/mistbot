# Database Migrations Guide

This guide explains how to use the database migration system for Mistbot.

## Overview

The migration system provides a structured way to manage database schema changes over time. Each migration is a SQL file that runs once and is tracked in the database.

## Quick Start

### Check Migration Status

```bash
npm run migration:status
```

This shows which migrations have been applied and which are pending.

### Run Pending Migrations

```bash
npm run migration:run
```

This applies all pending migrations in order. Each migration runs in a transaction, so if one fails, all changes are rolled back.

### Create a New Migration

```bash
npm run migration:create -- "description of the change"
```

Example:
```bash
npm run migration:create -- "add experience points to characters"
```

This creates a new migration file in the `migrations/` directory with the next available number.

## Migration File Structure

Migration files are named: `XXX_description.sql` where:
- `XXX` is a 3-digit number (001, 002, etc.)
- `description` briefly explains what the migration does
- Files must end with `.sql`

Example: `002_add_experience_points.sql`

## Writing Migrations

Migration files contain pure SQL statements. Here's an example:

```sql
-- Migration: Add experience points to characters
-- Created: 2024-12-03

-- Add new column
ALTER TABLE characters ADD COLUMN experience_points INTEGER DEFAULT 0;

-- Create index for better query performance
CREATE INDEX idx_characters_xp ON characters(experience_points);
```

### Best Practices

1. **One logical change per migration** - Don't mix unrelated changes
2. **Use IF NOT EXISTS where possible** - Makes migrations more robust
3. **Add comments** - Explain what and why
4. **Test before applying** - Test on a copy of the database first
5. **Never modify applied migrations** - Create a new migration instead

### Common Patterns

#### Adding a Column

```sql
ALTER TABLE table_name ADD COLUMN column_name TYPE DEFAULT value;
```

#### Creating a Table

```sql
CREATE TABLE IF NOT EXISTS new_table (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

#### Creating an Index

```sql
CREATE INDEX IF NOT EXISTS idx_name ON table_name(column_name);
```

#### Adding a Foreign Key (in a new table)

```sql
CREATE TABLE IF NOT EXISTS child_table (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES parent_table(id) ON DELETE CASCADE
);
```

## Migration Workflow

### For Development

1. Make schema changes by creating a migration:
   ```bash
   npm run migration:create -- "your change description"
   ```

2. Edit the generated file in `migrations/` directory

3. Test the migration:
   ```bash
   npm run migration:run
   ```

4. Verify the changes work with your code

5. Commit both the migration file and code changes

### For Production

1. Stop the bot:
   ```bash
   pm2 stop mistbot
   ```

2. Backup the database:
   ```bash
   cp data/mistbot.db data/mistbot.db.backup
   ```

3. Run migrations:
   ```bash
   npm run migration:run
   ```

4. Start the bot:
   ```bash
   pm2 start mistbot
   ```

5. Verify everything works correctly

6. Keep the backup for a few days, then delete if no issues

## Troubleshooting

### Migration Failed

If a migration fails:
1. Check the error message for SQL syntax errors
2. Fix the migration file
3. Run `npm run migration:run` again
4. The failed migration was rolled back, so it's safe to retry

### Database Locked

If you see "database is locked":
1. Make sure the bot is stopped
2. Close any database tools/viewers
3. Try again

### Want to Rollback a Migration

SQLite doesn't support automatic rollbacks of schema changes. To rollback:
1. Create a new migration that reverses the changes
2. For example, if you added a column, create a migration that drops it

Example rollback migration:

```sql
-- Rollback: Remove experience points column
ALTER TABLE characters DROP COLUMN experience_points;
DROP INDEX IF EXISTS idx_characters_xp;
```

### Need to Skip a Migration (Advanced)

**Warning**: Only do this if you're absolutely sure the migration has been applied manually or is not needed.

```javascript
// In node REPL or a script
import { db } from './utils/Database.js';
db.prepare('INSERT INTO migrations (name) VALUES (?)').run('XXX_migration_name.sql');
```

## How It Works

### Migration Tracking

The system uses a `migrations` table to track which migrations have been applied:

```sql
CREATE TABLE migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at INTEGER DEFAULT (strftime('%s', 'now'))
);
```

### Migration Process

1. System scans the `migrations/` directory for `.sql` files
2. Compares with the `migrations` table to find unapplied migrations
3. Runs each pending migration in alphabetical order
4. Each migration runs in a transaction
5. If successful, records the migration in the `migrations` table
6. If failed, rolls back the transaction and stops

### Automatic Check

When the bot starts, it automatically checks if migrations are pending and logs a warning if any are found. The bot will still start, but you should run the migrations.

## Migration Scripts Reference

### `npm run migration:status`
Shows current migration status (applied and pending migrations)

### `npm run migration:run`
Runs all pending migrations

### `npm run migration:create -- "description"`
Creates a new migration file

## Examples

### Example 1: Adding a New Feature

Let's say you want to add a "notes" field to characters:

```bash
# Create the migration
npm run migration:create -- "add notes field to characters"

# Edit migrations/002_add_notes_field_to_characters.sql
```

```sql
-- Migration: Add notes field to characters
-- Allows users to add custom notes to their characters

ALTER TABLE characters ADD COLUMN notes TEXT;
```

```bash
# Apply the migration
npm run migration:run
```

### Example 2: Creating a New Table

```bash
# Create the migration
npm run migration:create -- "add game sessions table"

# Edit migrations/003_add_game_sessions_table.sql
```

```sql
-- Migration: Add game sessions table
-- Track game sessions for statistics

CREATE TABLE IF NOT EXISTS game_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_name TEXT NOT NULL,
  started_at INTEGER DEFAULT (strftime('%s', 'now')),
  ended_at INTEGER,
  scene_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_scene ON game_sessions(scene_id);
```

```bash
# Apply the migration
npm run migration:run
```

### Example 3: Adding an Index for Performance

```bash
npm run migration:create -- "add index for character name searches"
```

```sql
-- Migration: Add index for character name searches
-- Improves performance when searching characters by name

CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name);
```

```bash
npm run migration:run
```

## Migration System Architecture

### Files

- `utils/MigrationManager.js` - Core migration logic
- `scripts/run-migrations.js` - CLI to run migrations
- `scripts/migration-status.js` - CLI to check status
- `scripts/create-migration.js` - CLI to create migrations
- `migrations/` - Directory containing migration files
- `migrations/README.md` - Quick reference guide

### Integration

The `Database.js` file automatically checks for pending migrations on startup and logs a warning if any are found.

## FAQ

**Q: Can I run migrations while the bot is running?**
A: It's not recommended. Stop the bot first to avoid database lock issues.

**Q: What happens if two migrations are created with the same number?**
A: The system will run both (in alphabetical order), but this can cause confusion. Always pull the latest code before creating a migration.

**Q: Can I delete a migration file after it's been applied?**
A: No, keep all migration files in the repository. They document the history of schema changes.

**Q: How do I see what's in the migrations table?**
A: Use `npm run migration:status` or query directly with sqlite3 CLI tool.

**Q: Can migrations contain multiple SQL statements?**
A: Yes, separate them with semicolons. They all run in one transaction.

**Q: What if I need to change data, not just schema?**
A: You can include UPDATE statements in migrations to modify existing data.

## Support

For issues or questions:
1. Check this guide and `migrations/README.md`
2. Review the SQLite documentation: https://www.sqlite.org/lang.html
3. Check better-sqlite3 docs: https://github.com/WiseLibs/better-sqlite3

