import { db } from './Database.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Storage utility for managing story tags, statuses, and limits per scene (channel/thread)
 */
export class StoryTagStorage {
  /**
   * Legacy load method for backward compatibility (used by migration)
   * @returns {Object} Map of sceneId -> { tags: [], statuses: [], limits: [] }
   */
  static loadFromJSON() {
    const STORAGE_FILE = join(process.cwd(), 'data', 'story-tags.json');
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
      console.error('Error loading scene data from JSON:', error);
      return {};
    }
  }

  /**
   * Ensure scene exists in database
   * @param {string} sceneId - Scene/channel ID
   */
  static ensureScene(sceneId) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO scenes (id)
      VALUES (?)
    `);
    stmt.run(sceneId);
  }

  /**
   * Get scene data
   * @param {string} sceneId - Channel or thread ID
   * @returns {Object} { tags: [], statuses: [], limits: [] }
   */
  static getScene(sceneId) {
    this.ensureScene(sceneId);
    
    const stmt = db.prepare(`
      SELECT tag, tag_type
      FROM scene_tags
      WHERE scene_id = ?
    `);
    
    const allTags = stmt.all(sceneId);
    
    return {
      tags: allTags.filter(t => t.tag_type === 'tag').map(t => t.tag),
      statuses: allTags.filter(t => t.tag_type === 'status').map(t => t.tag),
      limits: allTags.filter(t => t.tag_type === 'limit').map(t => t.tag),
    };
  }

  /**
   * Get tags for a scene
   * @param {string} sceneId - Channel or thread ID
   * @returns {string[]} Array of tags
   */
  static getTags(sceneId) {
    const scene = this.getScene(sceneId);
    return scene.tags;
  }

  /**
   * Get statuses for a scene
   * @param {string} sceneId - Channel or thread ID
   * @returns {string[]} Array of statuses
   */
  static getStatuses(sceneId) {
    const scene = this.getScene(sceneId);
    return scene.statuses;
  }

  /**
   * Get limits for a scene
   * @param {string} sceneId - Channel or thread ID
   * @returns {string[]} Array of limits
   */
  static getLimits(sceneId) {
    const scene = this.getScene(sceneId);
    return scene.limits;
  }

  /**
   * Add tags to a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} tags - Tags to add
   * @returns {string[]} Updated array of tags
   */
  static addTags(sceneId, tags) {
    this.ensureScene(sceneId);
    
    const insertStmt = db.prepare(`
      INSERT INTO scene_tags (scene_id, tag, tag_type)
      VALUES (?, ?, 'tag')
    `);
    
    const updateStmt = db.prepare(`
      UPDATE scenes
      SET updated_at = strftime('%s', 'now')
      WHERE id = ?
    `);
    
    const transaction = db.transaction(() => {
      tags.forEach(tag => {
        try {
          insertStmt.run(sceneId, tag);
        } catch (error) {
          // Ignore duplicate tag errors
          if (!error.message.includes('UNIQUE')) {
            throw error;
          }
        }
      });
      updateStmt.run(sceneId);
    });
    
    transaction();
    return this.getTags(sceneId);
  }

  /**
   * Add statuses to a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} statuses - Statuses to add
   * @returns {string[]} Updated array of statuses
   */
  static addStatuses(sceneId, statuses) {
    this.ensureScene(sceneId);
    
    const insertStmt = db.prepare(`
      INSERT INTO scene_tags (scene_id, tag, tag_type)
      VALUES (?, ?, 'status')
    `);
    
    const updateStmt = db.prepare(`
      UPDATE scenes
      SET updated_at = strftime('%s', 'now')
      WHERE id = ?
    `);
    
    const transaction = db.transaction(() => {
      statuses.forEach(status => {
        try {
          insertStmt.run(sceneId, status);
        } catch (error) {
          // Ignore duplicate status errors
          if (!error.message.includes('UNIQUE')) {
            throw error;
          }
        }
      });
      updateStmt.run(sceneId);
    });
    
    transaction();
    return this.getStatuses(sceneId);
  }

  /**
   * Add limits to a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} limits - Limits to add
   * @returns {string[]} Updated array of limits
   */
  static addLimits(sceneId, limits) {
    this.ensureScene(sceneId);
    
    const insertStmt = db.prepare(`
      INSERT INTO scene_tags (scene_id, tag, tag_type)
      VALUES (?, ?, 'limit')
    `);
    
    const updateStmt = db.prepare(`
      UPDATE scenes
      SET updated_at = strftime('%s', 'now')
      WHERE id = ?
    `);
    
    const transaction = db.transaction(() => {
      limits.forEach(limit => {
        try {
          insertStmt.run(sceneId, limit);
        } catch (error) {
          // Ignore duplicate limit errors
          if (!error.message.includes('UNIQUE')) {
            throw error;
          }
        }
      });
      updateStmt.run(sceneId);
    });
    
    transaction();
    return this.getLimits(sceneId);
  }

  /**
   * Remove tags from a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} tags - Tags to remove
   * @returns {string[]} Updated array of tags
   */
  static removeTags(sceneId, tags) {
    if (tags.length === 0) return this.getTags(sceneId);
    
    const deleteStmt = db.prepare(`
      DELETE FROM scene_tags
      WHERE scene_id = ? AND tag = ? AND tag_type = 'tag'
    `);
    
    const updateStmt = db.prepare(`
      UPDATE scenes
      SET updated_at = strftime('%s', 'now')
      WHERE id = ?
    `);
    
    const transaction = db.transaction(() => {
      tags.forEach(tag => {
        deleteStmt.run(sceneId, tag);
      });
      updateStmt.run(sceneId);
    });
    
    transaction();
    return this.getTags(sceneId);
  }

  /**
   * Remove statuses from a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} statuses - Statuses to remove
   * @returns {string[]} Updated array of statuses
   */
  static removeStatuses(sceneId, statuses) {
    if (statuses.length === 0) return this.getStatuses(sceneId);
    
    const deleteStmt = db.prepare(`
      DELETE FROM scene_tags
      WHERE scene_id = ? AND tag = ? AND tag_type = 'status'
    `);
    
    const updateStmt = db.prepare(`
      UPDATE scenes
      SET updated_at = strftime('%s', 'now')
      WHERE id = ?
    `);
    
    const transaction = db.transaction(() => {
      statuses.forEach(status => {
        deleteStmt.run(sceneId, status);
      });
      updateStmt.run(sceneId);
    });
    
    transaction();
    return this.getStatuses(sceneId);
  }

  /**
   * Remove limits from a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} limits - Limits to remove
   * @returns {string[]} Updated array of limits
   */
  static removeLimits(sceneId, limits) {
    if (limits.length === 0) return this.getLimits(sceneId);
    
    const deleteStmt = db.prepare(`
      DELETE FROM scene_tags
      WHERE scene_id = ? AND tag = ? AND tag_type = 'limit'
    `);
    
    const updateStmt = db.prepare(`
      UPDATE scenes
      SET updated_at = strftime('%s', 'now')
      WHERE id = ?
    `);
    
    const transaction = db.transaction(() => {
      limits.forEach(limit => {
        deleteStmt.run(sceneId, limit);
      });
      updateStmt.run(sceneId);
    });
    
    transaction();
    return this.getLimits(sceneId);
  }

  /**
   * Clear all tags, statuses, and limits for a scene
   * @param {string} sceneId - Channel or thread ID
   */
  static clearScene(sceneId) {
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM scene_tags WHERE scene_id = ?').run(sceneId);
      db.prepare('DELETE FROM scenes WHERE id = ?').run(sceneId);
    });
    
    transaction();
  }
}
