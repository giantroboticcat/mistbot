import { getDbForGuild } from './Database.js';

/**
 * Storage utility for managing story tags, statuses, and limits per scene (channel/thread)
 */
export class StoryTagStorage {
  /**
   * Ensure scene exists in database
   * @param {string} sceneId - Scene/channel ID
   */
  static ensureScene(guildId, sceneId) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO scenes (id)
      VALUES (?)
    `);
    stmt.run(sceneId);
  }

  /**
   * Get scene data
   * @param {string} sceneId - Channel or thread ID
   * @returns {Object} { tags: [], statuses: [], limits: [], blockeds: [] }
   */
  static getScene(guildId, sceneId) {
    this.ensureScene(guildId, sceneId);
    
    const db = getDbForGuild(guildId);
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
      blockeds: allTags.filter(t => t.tag_type === 'blocked').map(t => t.tag),
    };
  }

  /**
   * Get scene tags with IDs
   * @param {string} guildId - Guild ID
   * @param {string} sceneId - Scene ID
   * @returns {Array} Array of objects with { id, tag }
   */
  static getTagsWithIds(guildId, sceneId) {
    this.ensureScene(guildId, sceneId);
    
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      SELECT id, tag
      FROM scene_tags
      WHERE scene_id = ? AND tag_type = 'tag'
    `);
    
    return stmt.all(sceneId);
  }

  /**
   * Get scene statuses with IDs
   * @param {string} guildId - Guild ID
   * @param {string} sceneId - Scene ID
   * @returns {Array} Array of objects with { id, tag }
   */
  static getStatusesWithIds(guildId, sceneId) {
    this.ensureScene(guildId, sceneId);
    
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      SELECT id, tag
      FROM scene_tags
      WHERE scene_id = ? AND tag_type = 'status'
    `);
    
    return stmt.all(sceneId);
  }

  /**
   * Get tag data by entity ID for roll display/calculation
   * Blocked tags are excluded from rolls
   * @param {string} guildId - Guild ID
   * @param {number} tagId - Scene tag ID
   * @returns {Object|null} { name: string, type: 'tag'|'status', isWeakness: boolean, characterId: null } or null
   */
  static getTagDataByEntity(guildId, tagId) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare('SELECT tag, tag_type FROM scene_tags WHERE id = ?');
    const result = stmt.get(tagId);
    if (!result) return null;
    
    // Blocked tags should not be available to rolls
    if (result.tag_type === 'blocked') {
      return null;
    }
    
    return {
      name: result.tag,
      type: result.tag_type === 'status' ? 'status' : 'tag',
      isWeakness: false,
      characterId: null // Scene tags don't belong to any character
    };
  }

  /**
   * Get tags for a scene
   * @param {string} sceneId - Channel or thread ID
   * @returns {string[]} Array of tags
   */
  static getTags(guildId, sceneId) {
    const scene = this.getScene(guildId, sceneId);
    return scene.tags;
  }

  /**
   * Get statuses for a scene
   * @param {string} sceneId - Channel or thread ID
   * @returns {string[]} Array of statuses
   */
  static getStatuses(guildId, sceneId) {
    const scene = this.getScene(guildId, sceneId);
    return scene.statuses;
  }

  /**
   * Get limits for a scene
   * @param {string} sceneId - Channel or thread ID
   * @returns {string[]} Array of limits
   */
  static getLimits(guildId, sceneId) {
    const scene = this.getScene(guildId, sceneId);
    return scene.limits;
  }

  /**
   * Get blocked tags for a scene
   * @param {string} sceneId - Channel or thread ID
   * @returns {string[]} Array of blocked tags
   */
  static getBlockeds(guildId, sceneId) {
    const scene = this.getScene(guildId, sceneId);
    return scene.blockeds;
  }

  /**
   * Add tags to a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} tags - Tags to add
   * @returns {string[]} Updated array of tags
   */
  static addTags(guildId, sceneId, tags) {
    const db = getDbForGuild(guildId);
    this.ensureScene(guildId, sceneId);
    
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
        insertStmt.run(sceneId, tag);
      });
      updateStmt.run(sceneId);
    });
    
    transaction();
    return this.getTags(guildId, sceneId);
  }

  /**
   * Add statuses to a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} statuses - Statuses to add
   * @returns {string[]} Updated array of statuses
   */
  static addStatuses(guildId, sceneId, statuses) {
    const db = getDbForGuild(guildId);
    this.ensureScene(guildId, sceneId);
    
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
        insertStmt.run(sceneId, status);
      });
      updateStmt.run(sceneId);
    });
    
    transaction();
    return this.getStatuses(guildId, sceneId);
  }

  /**
   * Add limits to a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} limits - Limits to add
   * @returns {string[]} Updated array of limits
   */
  static addLimits(guildId, sceneId, limits) {
    const db = getDbForGuild(guildId);
    this.ensureScene(guildId, sceneId);
    
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
        insertStmt.run(sceneId, limit);
      });
      updateStmt.run(sceneId);
    });
    
    transaction();
    return this.getLimits(guildId, sceneId);
  }

  /**
   * Remove tags from a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} tags - Tags to remove
   * @returns {string[]} Updated array of tags
   */
  static removeTags(guildId, sceneId, tags) {
    const db = getDbForGuild(guildId);
    if (tags.length === 0) return this.getTags(guildId, sceneId);
    
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
    return this.getTags(guildId, sceneId);
  }

  /**
   * Remove statuses from a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} statuses - Statuses to remove
   * @returns {string[]} Updated array of statuses
   */
  static removeStatuses(guildId, sceneId, statuses) {
    const db = getDbForGuild(guildId);
    if (statuses.length === 0) return this.getStatuses(guildId, sceneId);
    
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
    return this.getStatuses(guildId, sceneId);
  }

  /**
   * Remove limits from a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} limits - Limits to remove
   * @returns {string[]} Updated array of limits
   */
  static removeLimits(guildId, sceneId, limits) {
    const db = getDbForGuild(guildId);
    if (limits.length === 0) return this.getLimits(guildId, sceneId);
    
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
    return this.getLimits(guildId, sceneId);
  }

  /**
   * Add blocked tags to a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} blockeds - Blocked tags to add
   * @returns {string[]} Updated array of blocked tags
   */
  static addBlockeds(guildId, sceneId, blockeds) {
    const db = getDbForGuild(guildId);
    this.ensureScene(guildId, sceneId);
    
    const insertStmt = db.prepare(`
      INSERT INTO scene_tags (scene_id, tag, tag_type)
      VALUES (?, ?, 'blocked')
    `);
    
    const updateStmt = db.prepare(`
      UPDATE scenes
      SET updated_at = strftime('%s', 'now')
      WHERE id = ?
    `);
    
    const transaction = db.transaction(() => {
      blockeds.forEach(blocked => {
        insertStmt.run(sceneId, blocked);
      });
      updateStmt.run(sceneId);
    });
    
    transaction();
    return this.getBlockeds(guildId, sceneId);
  }

  /**
   * Remove blocked tags from a scene
   * @param {string} sceneId - Channel or thread ID
   * @param {string[]} blockeds - Blocked tags to remove
   * @returns {string[]} Updated array of blocked tags
   */
  static removeBlockeds(guildId, sceneId, blockeds) {
    const db = getDbForGuild(guildId);
    if (blockeds.length === 0) return this.getBlockeds(guildId, sceneId);
    
    const deleteStmt = db.prepare(`
      DELETE FROM scene_tags
      WHERE scene_id = ? AND tag = ? AND tag_type = 'blocked'
    `);
    
    const updateStmt = db.prepare(`
      UPDATE scenes
      SET updated_at = strftime('%s', 'now')
      WHERE id = ?
    `);
    
    const transaction = db.transaction(() => {
      blockeds.forEach(blocked => {
        deleteStmt.run(sceneId, blocked);
      });
      updateStmt.run(sceneId);
    });
    
    transaction();
    return this.getBlockeds(guildId, sceneId);
  }

  /**
   * Clear all tags, statuses, and limits for a scene
   * @param {string} sceneId - Channel or thread ID
   */
  static clearScene(guildId, sceneId) {
    const db = getDbForGuild(guildId);
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM scene_tags WHERE scene_id = ?').run(sceneId);
      db.prepare('DELETE FROM scenes WHERE id = ?').run(sceneId);
    });
    
    transaction();
  }
}
