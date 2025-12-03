import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

/**
 * Database migration manager
 * Handles running and tracking database schema migrations
 */
export class MigrationManager {
  constructor(db) {
    this.db = db;
    this.ensureMigrationsTable();
  }

  /**
   * Ensure the migrations tracking table exists
   */
  ensureMigrationsTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);
  }

  /**
   * Get list of applied migrations
   */
  getAppliedMigrations() {
    const stmt = this.db.prepare('SELECT name FROM migrations ORDER BY name');
    return stmt.all().map(row => row.name);
  }

  /**
   * Get list of pending migrations
   */
  getPendingMigrations() {
    if (!existsSync(MIGRATIONS_DIR)) {
      return [];
    }

    const allMigrations = readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql'))
      .sort();

    const appliedMigrations = new Set(this.getAppliedMigrations());
    return allMigrations.filter(name => !appliedMigrations.has(name));
  }

  /**
   * Run a single migration
   */
  runMigration(name) {
    const filePath = join(MIGRATIONS_DIR, name);
    
    if (!existsSync(filePath)) {
      throw new Error(`Migration file not found: ${name}`);
    }

    const sql = readFileSync(filePath, 'utf-8');
    
    // Run migration in a transaction
    const transaction = this.db.transaction(() => {
      // Execute the migration SQL
      this.db.exec(sql);
      
      // Record that this migration was applied
      const stmt = this.db.prepare('INSERT INTO migrations (name) VALUES (?)');
      stmt.run(name);
    });

    transaction();
  }

  /**
   * Run all pending migrations
   */
  runPendingMigrations() {
    const pending = this.getPendingMigrations();
    
    if (pending.length === 0) {
      return { count: 0, migrations: [] };
    }

    const applied = [];
    
    for (const migration of pending) {
      try {
        this.runMigration(migration);
        applied.push(migration);
      } catch (error) {
        throw new Error(`Failed to apply migration ${migration}: ${error.message}`);
      }
    }

    return { count: applied.length, migrations: applied };
  }

  /**
   * Get migration status
   */
  getStatus() {
    const applied = this.getAppliedMigrations();
    const pending = this.getPendingMigrations();
    
    return {
      applied: {
        count: applied.length,
        migrations: applied
      },
      pending: {
        count: pending.length,
        migrations: pending
      }
    };
  }

  /**
   * Check if migrations are up to date
   */
  isUpToDate() {
    return this.getPendingMigrations().length === 0;
  }
}

export default MigrationManager;

