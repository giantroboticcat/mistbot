/**
 * Utility for managing blacklisted sheet tab gids
 * Reads from FELLOWSHIP_SHEET_BLACKLIST_GIDS environment variable
 */

/**
 * Get the set of blacklisted gids from environment variable
 * @returns {Set<string>} Set of blacklisted gid strings
 */
export function getBlacklistedGids() {
  const blacklistGids = new Set();
  
  if (process.env.FELLOWSHIP_SHEET_BLACKLIST_GIDS) {
    process.env.FELLOWSHIP_SHEET_BLACKLIST_GIDS
      .split(',')
      .map(gid => gid.trim())
      .filter(gid => gid.length > 0)
      .forEach(gid => blacklistGids.add(gid));
  }
  
  return blacklistGids;
}

/**
 * Check if a gid is blacklisted
 * @param {string} gid - The gid to check
 * @returns {boolean} True if the gid is blacklisted
 */
export function isGidBlacklisted(gid) {
  return getBlacklistedGids().has(gid);
}

