# Database Migrations

This directory contains database migration files for the Mistbot SQLite database.

## Migration File Naming

Migration files should follow this naming convention:
```
XXX_descriptive_name.sql
```

Where:
- `XXX` is a zero-padded 3-digit number (e.g., 001, 002, 003)
- `descriptive_name` briefly describes what the migration does
- Files must end with `.sql`

Examples:
- `001_initial_schema.sql`
- `002_add_user_settings.sql`
- `003_add_roll_dice_results.sql`

## Creating a New Migration

Use the create-migration script:

```bash
npm run migration:create -- "add user settings"
```

This will create a new migration file with the next available number.

## Running Migrations

To run all pending migrations:

```bash
npm run migration:run
```

To check migration status:

```bash
npm run migration:status
```

## Migration File Format

Migration files should contain pure SQL statements. They are executed in a transaction, so if any statement fails, the entire migration is rolled back.

Example migration file:

```sql
-- Add a new column to the characters table
ALTER TABLE characters ADD COLUMN experience_points INTEGER DEFAULT 0;

-- Create a new table
CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY,
  timezone TEXT,
  notifications_enabled INTEGER DEFAULT 1
);

-- Create an index
CREATE INDEX idx_user_settings_notifications ON user_settings(notifications_enabled);
```

## Best Practices

1. **Never modify existing migrations** - Once a migration has been applied to production, it should never be changed. Create a new migration instead.

2. **Make migrations idempotent when possible** - Use `IF NOT EXISTS` and `IF EXISTS` clauses where appropriate.

3. **Test migrations** - Always test your migrations on a copy of the database before applying to production.

4. **Keep migrations focused** - Each migration should do one logical thing (e.g., add a feature, fix a bug).

5. **Write down migrations** - Include comments explaining what the migration does and why.

6. **Backup before migrating** - Always backup your database before running migrations on production data.

## Troubleshooting

### Migration failed mid-way

Migrations run in transactions, so if a migration fails, all changes are rolled back. Fix the SQL error in the migration file and run it again.

### Need to skip a migration

This is generally not recommended, but if you need to manually mark a migration as applied:

```javascript
// In node REPL or a script
import { db } from './utils/Database.js';
db.prepare('INSERT INTO migrations (name) VALUES (?)').run('XXX_migration_name.sql');
```

### Need to rollback a migration

SQLite doesn't support automatic rollback of schema changes. You'll need to manually create a new migration that reverses the changes.

