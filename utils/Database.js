import Database from 'better-sqlite3';
import { join, resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { MigrationManager } from './MigrationManager.js';

// Allow database path to be overridden via environment variable for testing
// Resolve to absolute path to avoid issues with relative paths
const DB_PATH = process.env.DB_PATH 
  ? resolve(process.cwd(), process.env.DB_PATH)
  : join(process.cwd(), 'data', 'mistbot.db');

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

// Lazy getter function - returns the db connection only when accessed
let _db = null;
function getDb() {
  if (!_db) {
    _db = dbManager.getConnection();
  }
  return _db;
}

// Create a proxy that forwards all property access to the actual database
// This allows us to use db.prepare() etc. without initializing the DB on import
export const db = new Proxy({}, {
  get(target, prop) {
    // Handle special properties
    if (prop === Symbol.toPrimitive || prop === 'toString' || prop === 'valueOf') {
      return () => '[Database Proxy]';
    }
    const actualDb = getDb();
    const value = actualDb[prop];
    // If it's a function, bind it to the actual database
    if (typeof value === 'function') {
      return value.bind(actualDb);
    }
    return value;
  },
  has(target, prop) {
    const actualDb = getDb();
    return prop in actualDb;
  }
});

export default dbManager;

