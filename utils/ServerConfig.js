import dotenv from 'dotenv';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Utility for accessing server-specific (guild-specific) environment variables
 * 
 * Uses separate .env files per server:
 * - .env (base/shared config)
 * - .env.{guildId} (server-specific config, e.g., .env.996943472571453480)
 * 
 * Server-specific files override base .env values
 */

// Cache of loaded guild env values to avoid file I/O on every access
const guildEnvCache = new Map();

/**
 * Load environment variables for a specific guild
 * @param {string} guildId - Discord guild ID
 * @returns {Object} Object with env vars from the guild's .env file
 */
export function loadGuildEnv(guildId) {
  if (!guildId) {
    return {};
  }
  
  // Return cached values if available
  if (guildEnvCache.has(guildId)) {
    return guildEnvCache.get(guildId);
  }
  
  const envFile = join(process.cwd(), `.env.${guildId}`);
  const guildEnv = {};
  
  if (existsSync(envFile)) {
    try {
      // Parse the file without modifying process.env
      const envContent = readFileSync(envFile, 'utf-8');
      const parsed = dotenv.parse(envContent);
      Object.assign(guildEnv, parsed);
      guildEnvCache.set(guildId, guildEnv);
      console.log(`Loaded environment config for guild: ${guildId}`);
    } catch (error) {
      console.warn(`Warning: Could not load .env.${guildId}:`, error.message);
      // Cache empty object so we don't try to load again
      guildEnvCache.set(guildId, guildEnv);
    }
  } else {
    // Cache empty object so we don't try to load again
    guildEnvCache.set(guildId, guildEnv);
  }
  
  return guildEnv;
}

/**
 * Load all guild-specific environment files
 * Scans for .env.{guildId} files and loads them into cache
 * Note: These are cached but not merged into process.env to avoid conflicts
 */
export function loadAllGuildEnvs() {
  try {
    const files = readdirSync(process.cwd());
    const guildEnvFiles = files.filter(file => 
      file.startsWith('.env.') && /^\.env\.\d{17,19}$/.test(file)
    );
    
    for (const file of guildEnvFiles) {
      const guildId = file.replace('.env.', '');
      loadGuildEnv(guildId); // This will cache the values
    }
    
    return guildEnvFiles.length;
  } catch (error) {
    console.warn('Could not scan for guild environment files:', error.message);
    return 0;
  }
}

/**
 * Initialize environment loading
 * Loads base .env and all guild-specific .env files
 */
export function initializeEnvs() {
  // Load base .env first
  dotenv.config();
  
  // Then load all guild-specific env files
  const count = loadAllGuildEnvs();
  if (count > 0) {
    console.log(`Loaded ${count} guild-specific environment file(s)`);
  }
}

/**
 * Get a server-specific environment variable
 * @param {string} varName - Environment variable name (e.g., 'FELLOWSHIP_SHEET_URL')
 * @param {string} guildId - Discord guild ID
 * @param {string|null} defaultValue - Default value if not found (optional)
 * @returns {string|null} The environment variable value or default
 */
export function getServerEnv(varName, guildId, defaultValue = null) {
  // If guild ID is provided, check guild-specific env file first
  if (guildId) {
    const guildEnv = loadGuildEnv(guildId);
    if (guildEnv[varName] !== undefined) {
      return guildEnv[varName];
    }
  }
  
  // Fall back to base .env (process.env)
  if (process.env[varName] !== undefined) {
    return process.env[varName];
  }
  
  // Finally, return default
  return defaultValue;
}

/**
 * Get a server-specific environment variable as a boolean
 * @param {string} varName - Base environment variable name
 * @param {string} guildId - Discord guild ID
 * @param {boolean} defaultValue - Default value if not found
 * @returns {boolean} The boolean value
 */
export function getServerEnvBool(varName, guildId, defaultValue = false) {
  const value = getServerEnv(varName, guildId);
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return value === 'true' || value === '1' || value === 'yes';
}

/**
 * Get a server-specific environment variable as an array (comma-separated)
 * @param {string} varName - Base environment variable name
 * @param {string} guildId - Discord guild ID
 * @param {string[]} defaultValue - Default value if not found
 * @returns {string[]} The array of values
 */
export function getServerEnvArray(varName, guildId, defaultValue = []) {
  const value = getServerEnv(varName, guildId);
  if (!value) {
    return defaultValue;
  }
  return value
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

/**
 * Get all known guild IDs from environment files
 * Scans for .env.{guildId} files and extracts guild IDs
 * @returns {Set<string>} Set of guild IDs found in environment files
 */
export function getKnownGuildIds() {
  const guildIds = new Set();
  
  try {
    const files = readdirSync(process.cwd());
    const guildEnvFiles = files.filter(file => 
      file.startsWith('.env.') && /^\.env\.\d{17,19}$/.test(file)
    );
    
    for (const file of guildEnvFiles) {
      const guildId = file.replace('.env.', '');
      guildIds.add(guildId);
    }
  } catch (error) {
    console.warn('Could not scan for guild environment files:', error.message);
  }
  
  // Also check for explicit GUILD_ID or DEFAULT_GUILD_ID in base .env
  if (process.env.GUILD_ID) {
    guildIds.add(process.env.GUILD_ID);
  }
  if (process.env.DEFAULT_GUILD_ID) {
    guildIds.add(process.env.DEFAULT_GUILD_ID);
  }
  
  return guildIds;
}

/**
 * Get all guild IDs that have databases
 * Scans the data directory for mistbot-{guildId}.db files
 * @returns {Promise<Set<string>>} Set of guild IDs with databases
 */
export async function getGuildIdsWithDatabases() {
  const { readdirSync, statSync } = await import('fs');
  const { join } = await import('path');
  
  const guildIds = new Set();
  const dataDir = join(process.cwd(), 'data');
  
  try {
    if (!readdirSync) {
      return guildIds;
    }
    
    const files = readdirSync(dataDir);
    for (const file of files) {
      // Match pattern: mistbot-{guildId}.db
      const match = file.match(/^mistbot-(\d{17,19})\.db$/);
      if (match) {
        guildIds.add(match[1]);
      }
    }
  } catch (error) {
    // Data directory doesn't exist or can't be read
    console.warn('Could not scan data directory for guild databases:', error.message);
  }
  
  return guildIds;
}

