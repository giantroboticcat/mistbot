import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const STORAGE_FILE = join(process.cwd(), 'data', 'story-tags.json');

/**
 * Storage utility for managing story tags, statuses, and limits per scene (channel/thread)
 */
export class StoryTagStorage {
  /**
   * Load scene data from storage file
   * @returns {Object} Map of sceneId -> { tags: [], statuses: [], limits: [] }
   */
  static load() {
    if (!existsSync(STORAGE_FILE)) {
      return {};
    }

    try {
      const data = readFileSync(STORAGE_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      // Migrate old format (array of tags) to new format (object with tags, statuses, limits)
      const migrated = {};
      for (const [sceneId, value] of Object.entries(parsed)) {
        if (Array.isArray(value)) {
          // Old format: just tags array
          migrated[sceneId] = { tags: value, statuses: [], limits: [] };
        } else {
          // New format: object with tags, statuses, limits
          migrated[sceneId] = {
            tags: value.tags || [],
            statuses: value.statuses || [],
            limits: value.limits || [],
          };
        }
      }
      return migrated;
    } catch (error) {
      console.error('Error loading scene data:', error);
      return {};
    }
  }

  /**
   * Save scene data to storage file
   * @param {Object} data - Map of sceneId -> { tags: [], statuses: [], limits: [] }
   */
  static save(data) {
    // Ensure data directory exists
    const dataDir = join(process.cwd(), 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    try {
      writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving scene data:', error);
      throw error;
    }
  }

  /**
   * Get scene data, ensuring it exists
   * @param {string} sceneId - Channel or thread ID
   * @returns {Object} { tags: [], statuses: [], limits: [] }
   */
  static getScene(sceneId) {
    const data = this.load();
    if (!data[sceneId]) {
      data[sceneId] = { tags: [], statuses: [], limits: [] };
    }
    return data[sceneId];
  }

  /**
   * Get tags for a scene
   * @param {string} sceneId - Channel or thread ID
   * @returns {string[]} Array of tags
   */
  static getTags(sceneId) {
    return this.getScene(sceneId).tags;
  }

  /**
   * Get statuses for a scene
   * @param {string} sceneId - Channel or thread ID
   * @returns {string[]} Array of statuses
   */
  static getStatuses(sceneId) {
    return this.getScene(sceneId).statuses;
  }

  /**
   * Get limits for a scene
   * @param {string} sceneId - Channel or thread ID
   * @returns {string[]} Array of limits
   */
  static getLimits(sceneId) {
    return this.getScene(sceneId).limits;
  }

  /**
   * Helper method to add items to a list (tags, statuses, or limits)
   * @param {string} sceneId - Channel or thread ID
   * @param {string} type - 'tags', 'statuses', or 'limits'
   * @param {string[]} items - Items to add
   * @returns {string[]} Updated array
   */
  static addItems(sceneId, type, items) {
    const data = this.load();
    const scene = this.getScene(sceneId);
    const existing = scene[type] || [];
    
    // Add new items, removing duplicates (case-insensitive)
    const itemSet = new Set(existing.map(t => t.toLowerCase()));
    const newItems = items.filter(item => {
      const lowerItem = item.trim().toLowerCase();
      if (!lowerItem) return false; // Skip empty items
      if (itemSet.has(lowerItem)) return false; // Skip duplicates
      itemSet.add(lowerItem);
      return true;
    });

    // Preserve original case of existing items, add new ones
    const allItems = [...existing];
    items.forEach(item => {
      const trimmed = item.trim();
      if (trimmed && !existing.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
        allItems.push(trimmed);
      }
    });

    scene[type] = allItems;
    data[sceneId] = scene;
    this.save(data);
    return allItems;
  }

  /**
   * Helper method to remove items from a list
   * @param {string} sceneId - Channel or thread ID
   * @param {string} type - 'tags', 'statuses', or 'limits'
   * @param {string[]} items - Items to remove
   * @returns {string[]} Updated array
   */
  static removeItems(sceneId, type, items) {
    const data = this.load();
    const scene = this.getScene(sceneId);
    const existing = scene[type] || [];
    
    // Remove items (case-insensitive)
    const itemsToRemove = new Set(items.map(t => t.trim().toLowerCase()));
    const updated = existing.filter(item => 
      !itemsToRemove.has(item.toLowerCase())
    );

    scene[type] = updated;
    data[sceneId] = scene;
    this.save(data);
    return updated;
  }

  /**
   * Add tags to a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} tags - Tags to add
   * @returns {string[]} Updated array of tags
   */
  static addTags(sceneId, tags) {
    return this.addItems(sceneId, 'tags', tags);
  }

  /**
   * Remove tags from a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} tags - Tags to remove
   * @returns {string[]} Updated array of tags
   */
  static removeTags(sceneId, tags) {
    return this.removeItems(sceneId, 'tags', tags);
  }

  /**
   * Add statuses to a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} statuses - Statuses to add
   * @returns {string[]} Updated array of statuses
   */
  static addStatuses(sceneId, statuses) {
    return this.addItems(sceneId, 'statuses', statuses);
  }

  /**
   * Remove statuses from a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} statuses - Statuses to remove
   * @returns {string[]} Updated array of statuses
   */
  static removeStatuses(sceneId, statuses) {
    return this.removeItems(sceneId, 'statuses', statuses);
  }

  /**
   * Add limits to a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} limits - Limits to add
   * @returns {string[]} Updated array of limits
   */
  static addLimits(sceneId, limits) {
    return this.addItems(sceneId, 'limits', limits);
  }

  /**
   * Remove limits from a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} limits - Limits to remove
   * @returns {string[]} Updated array of limits
   */
  static removeLimits(sceneId, limits) {
    return this.removeItems(sceneId, 'limits', limits);
  }

  /**
   * Clear all data from a scene (tags, statuses, and limits)
   * @param {string} sceneId - Channel or thread ID
   */
  static clearScene(sceneId) {
    const data = this.load();
    delete data[sceneId];
    this.save(data);
  }
}

