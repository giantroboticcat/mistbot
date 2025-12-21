import Database from 'better-sqlite3';
import { join, resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { MigrationManager } from './MigrationManager.js';

/**
 * Database initialization and connection management with per-guild support
 */
class DatabaseManager {
  constructor() {
    // Map of guildId -> database connection
    this.databases = new Map();
  }

  /**
   * Get database path for a specific guild
   * @param {string} guildId - The Discord guild ID
   * @returns {string} The database file path
   */
  getDbPath(guildId) {
    // Allow database path to be overridden via environment variable for testing
    // If DB_PATH is set, use it as a template with {guildId} placeholder, or use as-is if no placeholder
    if (process.env.DB_PATH) {
      const dbPath = resolve(process.cwd(), process.env.DB_PATH);
      // If the path contains {guildId}, replace it
      if (dbPath.includes('{guildId}')) {
        return dbPath.replace('{guildId}', guildId);
      }
      // If it's a directory, append the guild-specific filename
      if (dbPath.endsWith('.db')) {
        // If it's already a .db file, use it as template
        const dir = dbPath.substring(0, dbPath.lastIndexOf('/'));
        const baseName = dbPath.substring(dbPath.lastIndexOf('/') + 1, dbPath.lastIndexOf('.db'));
        return join(dir, `${baseName}-${guildId}.db`);
      }
      return dbPath;
    }
    
    // Default: use data/mistbot-{guildId}.db
    return join(process.cwd(), 'data', `mistbot-${guildId}.db`);
  }

  /**
   * Get database connection for a specific guild
   * @param {string} guildId - The Discord guild ID
   * @returns {Database} The database connection
   */
  getConnection(guildId) {
    if (!guildId) {
      throw new Error('Guild ID is required to get database connection');
    }

    // Return cached connection if it exists
    if (this.databases.has(guildId)) {
      return this.databases.get(guildId);
    }

    // Ensure data directory exists
    const dataDir = join(process.cwd(), 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    // Create new database connection for this guild
    const dbPath = this.getDbPath(guildId);
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    
    // Initialize schema for this database
    this.initSchema(db, guildId);
    
    // Cache the connection
    this.databases.set(guildId, db);
    
    return db;
  }

  /**
   * Initialize database schema using migrations
   * @param {Database} db - The database connection
   * @param {string} guildId - The guild ID (for logging)
   */
  initSchema(db, guildId) {
    try {
      const migrationManager = new MigrationManager(db);
      
      // Check if migrations are up to date
      if (!migrationManager.isUpToDate()) {
        console.log(`⚠️  Database migrations are pending for guild ${guildId}. Run: npm run migration:run`);
      }
    } catch (error) {
      console.error(`⚠️  Error checking migrations for guild ${guildId}:`, error.message);
    }
  }

  /**
   * Close database connection for a specific guild
   * @param {string} guildId - The Discord guild ID
   */
  close(guildId) {
    if (this.databases.has(guildId)) {
      const db = this.databases.get(guildId);
      db.close();
      this.databases.delete(guildId);
    }
  }

  /**
   * Close all database connections
   */
  closeAll() {
    for (const [guildId, db] of this.databases.entries()) {
      db.close();
    }
    this.databases.clear();
  }
}

// Export singleton instance
const dbManager = new DatabaseManager();

/**
 * Get database connection for a specific guild
 * @param {string} guildId - The Discord guild ID
 * @returns {Database} The database connection
 */
export function getDbForGuild(guildId) {
  return dbManager.getConnection(guildId);
}

// For backward compatibility, export a default database connection
// This uses a default guild ID from environment or throws an error
// Note: This should only be used for migrations and scripts that don't have a guild context
let _defaultDb = null;
function getDefaultDb() {
  if (!_defaultDb) {
    // Try to use a default guild ID from environment, or use a fallback
    const defaultGuildId = process.env.DEFAULT_GUILD_ID || 'default';
    _defaultDb = dbManager.getConnection(defaultGuildId);
  }
  return _defaultDb;
}

// Create a proxy that forwards all property access to the default database
// This allows backward compatibility for code that hasn't been updated yet
// WARNING: This will use the default guild database. New code should use getDbForGuild(guildId)
export const db = new Proxy({}, {
  get(target, prop) {
    // Handle special properties
    if (prop === Symbol.toPrimitive || prop === 'toString' || prop === 'valueOf') {
      return () => '[Database Proxy - Using Default Guild]';
    }
    const actualDb = getDefaultDb();
    const value = actualDb[prop];
    // If it's a function, bind it to the actual database
    if (typeof value === 'function') {
      return value.bind(actualDb);
    }
    return value;
  },
  has(target, prop) {
    const actualDb = getDefaultDb();
    return prop in actualDb;
  }
});

export default dbManager;

