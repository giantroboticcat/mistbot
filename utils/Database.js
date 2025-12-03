import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { MigrationManager } from './MigrationManager.js';

const DB_PATH = join(process.cwd(), 'data', 'mistbot.db');

/**
 * Database initialization and connection management
 */
class DatabaseManager {
  constructor() {
    this.db = null;
  }

  /**
   * Get database connection (singleton)
   */
  getConnection() {
    if (!this.db) {
      // Ensure data directory exists
      const dataDir = join(process.cwd(), 'data');
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }

      this.db = new Database(DB_PATH);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.initSchema();
    }
    return this.db;
  }

  /**
   * Initialize database schema using migrations
   */
  initSchema() {
    try {
      const migrationManager = new MigrationManager(this.db);
      
      // Check if migrations are up to date
      if (!migrationManager.isUpToDate()) {
        console.log('⚠️  Database migrations are pending. Run: npm run migration:run');
      }
    } catch (error) {
      console.error('⚠️  Error checking migrations:', error.message);
    }
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Export singleton instance
const dbManager = new DatabaseManager();
export const db = dbManager.getConnection();
export default dbManager;

