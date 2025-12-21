import { getServerEnvArray } from './ServerConfig.js';

/**
 * Utility for managing blacklisted sheet tab gids
 * Reads from FELLOWSHIP_SHEET_BLACKLIST_GIDS environment variable (server-specific)
 */

/**
 * Get the set of blacklisted gids from environment variable
 * @param {string} guildId - Discord guild ID
 * @returns {Set<string>} Set of blacklisted gid strings
 */
export function getBlacklistedGids(guildId) {
  const blacklistArray = getServerEnvArray('FELLOWSHIP_SHEET_BLACKLIST_GIDS', guildId, []);
  return new Set(blacklistArray);
}

/**
 * Check if a gid is blacklisted
 * @param {string} guildId - Discord guild ID
 * @param {string} gid - The gid to check
 * @returns {boolean} True if the gid is blacklisted
 */
export function isGidBlacklisted(guildId, gid) {
  return getBlacklistedGids(guildId).has(gid);
}

