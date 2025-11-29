import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const STORAGE_FILE = join(process.cwd(), 'data', 'story-tags.json');

/**
 * Storage utility for managing story tags per scene (channel/thread)
 */
export class StoryTagStorage {
  /**
   * Load story tags from storage file
   * @returns {Object} Map of sceneId -> array of tags
   */
  static load() {
    if (!existsSync(STORAGE_FILE)) {
      return {};
    }

    try {
      const data = readFileSync(STORAGE_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading story tags:', error);
      return {};
    }
  }

  /**
   * Save story tags to storage file
   * @param {Object} data - Map of sceneId -> array of tags
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
      console.error('Error saving story tags:', error);
      throw error;
    }
  }

  /**
   * Get tags for a scene
   * @param {string} sceneId - Channel or thread ID
   * @returns {string[]} Array of tags
   */
  static getTags(sceneId) {
    const data = this.load();
    return data[sceneId] || [];
  }

  /**
   * Add tags to a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} tags - Tags to add
   * @returns {string[]} Updated array of tags (with duplicates removed)
   */
  static addTags(sceneId, tags) {
    const data = this.load();
    const existingTags = data[sceneId] || [];
    
    // Add new tags, removing duplicates (case-insensitive)
    const tagSet = new Set(existingTags.map(t => t.toLowerCase()));
    const newTags = tags.filter(tag => {
      const lowerTag = tag.trim().toLowerCase();
      if (!lowerTag) return false; // Skip empty tags
      if (tagSet.has(lowerTag)) return false; // Skip duplicates
      tagSet.add(lowerTag);
      return true;
    });

    // Preserve original case of existing tags, add new ones
    const allTags = [...existingTags];
    tags.forEach(tag => {
      const trimmed = tag.trim();
      if (trimmed && !existingTags.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
        allTags.push(trimmed);
      }
    });

    data[sceneId] = allTags;
    this.save(data);
    return allTags;
  }

  /**
   * Remove tags from a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} tags - Tags to remove
   * @returns {string[]} Updated array of tags
   */
  static removeTags(sceneId, tags) {
    const data = this.load();
    const existingTags = data[sceneId] || [];
    
    // Remove tags (case-insensitive)
    const tagsToRemove = new Set(tags.map(t => t.trim().toLowerCase()));
    const updatedTags = existingTags.filter(tag => 
      !tagsToRemove.has(tag.toLowerCase())
    );

    data[sceneId] = updatedTags;
    this.save(data);
    return updatedTags;
  }

  /**
   * Clear all tags from a scene
   * @param {string} sceneId - Channel or thread ID
   */
  static clearTags(sceneId) {
    const data = this.load();
    delete data[sceneId];
    this.save(data);
  }
}

