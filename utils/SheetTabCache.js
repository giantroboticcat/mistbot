/**
 * Cache for Google Sheets tab information
 * Scans FELLOWSHIP_SHEET_URL for tabs and caches them to avoid constant API calls
 */
class SheetTabCache {
  constructor() {
    this.cache = null;
    this.cacheTimestamp = null;
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get cached tabs or fetch fresh ones if cache is expired
   * @param {Function} fetchFunction - Function to fetch tabs if cache is invalid
   * @returns {Promise<Array>} Array of tab objects with { title, sheetId, gid }
   */
  async getTabs(fetchFunction) {
    const now = Date.now();
    
    // Return cached data if still valid
    if (this.cache && this.cacheTimestamp && (now - this.cacheTimestamp) < this.cacheTimeout) {
      return this.cache;
    }

    // Fetch fresh data
    const tabs = await fetchFunction();
    
    // Update cache
    this.cache = tabs;
    this.cacheTimestamp = now;
    
    return tabs;
  }

  /**
   * Invalidate the cache (force refresh on next request)
   */
  invalidate() {
    this.cache = null;
    this.cacheTimestamp = null;
  }

  /**
   * Clear the cache
   */
  clear() {
    this.invalidate();
  }
}

// Export singleton instance
export const sheetTabCache = new SheetTabCache();
export default sheetTabCache;

