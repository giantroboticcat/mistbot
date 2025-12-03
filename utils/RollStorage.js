import { db } from './Database.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Storage utility for managing roll proposals
 */
export class RollStorage {
  /**
   * Legacy load method for backward compatibility (used by migration)
   * @returns {Object} Map of rollId -> roll proposal data
   */
  static loadFromJSON() {
    const STORAGE_FILE = join(process.cwd(), 'data', 'rolls.json');
    if (!existsSync(STORAGE_FILE)) {
      return {};
    }

    try {
      const data = readFileSync(STORAGE_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      // Convert Sets back from arrays
      for (const roll of Object.values(parsed)) {
        if (roll.helpTags) roll.helpTags = new Set(roll.helpTags);
        if (roll.hinderTags) roll.hinderTags = new Set(roll.hinderTags);
        if (roll.burnedTags) roll.burnedTags = new Set(roll.burnedTags);
      }
      return parsed;
    } catch (error) {
      console.error('Error loading roll data from JSON:', error);
      return {};
    }
  }

  /**
   * Get the next sequential roll ID
   * @returns {number} Next roll ID
   */
  static getNextId() {
    const stmt = db.prepare('SELECT MAX(id) as maxId FROM rolls');
    const result = stmt.get();
    return (result.maxId || 0) + 1;
  }

  /**
   * Create a new roll proposal
   * @param {Object} rollData - Roll proposal data
   * @returns {number} The roll ID
   */
  static createRoll(rollData) {
    const transaction = db.transaction(() => {
      // Insert roll
      const insertRoll = db.prepare(`
        INSERT INTO rolls (creator_id, character_id, scene_id, description, status)
        VALUES (?, ?, ?, ?, 'pending')
      `);
      
      const result = insertRoll.run(
        rollData.creatorId,
        rollData.characterId || null,
        rollData.sceneId,
        rollData.description || null
      );
      
      const rollId = result.lastInsertRowid;
      
      // Insert help tags
      const insertTag = db.prepare(`
        INSERT INTO roll_tags (roll_id, tag, tag_type, is_burned)
        VALUES (?, ?, ?, ?)
      `);
      
      if (rollData.helpTags) {
        const helpTagsArray = rollData.helpTags instanceof Set 
          ? Array.from(rollData.helpTags) 
          : rollData.helpTags;
        
        const burnedTagsSet = rollData.burnedTags instanceof Set 
          ? rollData.burnedTags 
          : new Set(rollData.burnedTags || []);
        
        helpTagsArray.forEach(tag => {
          const isBurned = burnedTagsSet.has(tag) ? 1 : 0;
          insertTag.run(rollId, tag, 'help', isBurned);
        });
      }
      
      // Insert hinder tags
      if (rollData.hinderTags) {
        const hinderTagsArray = rollData.hinderTags instanceof Set 
          ? Array.from(rollData.hinderTags) 
          : rollData.hinderTags;
        
        hinderTagsArray.forEach(tag => {
          insertTag.run(rollId, tag, 'hinder', 0);
        });
      }
      
      return rollId;
    });
    
    return transaction();
  }

  /**
   * Get a roll by ID
   * @param {number} rollId - Roll ID
   * @returns {Object|null} Roll data or null if not found
   */
  static getRoll(rollId) {
    const stmt = db.prepare(`
      SELECT id, creator_id, character_id, scene_id, description, status, confirmed_by, created_at, updated_at
      FROM rolls
      WHERE id = ?
    `);
    
    const roll = stmt.get(rollId);
    if (!roll) {
      return null;
    }
    
    // Load tags
    const tagsStmt = db.prepare(`
      SELECT tag, tag_type, is_burned
      FROM roll_tags
      WHERE roll_id = ?
    `);
    
    const tags = tagsStmt.all(rollId);
    
    roll.helpTags = new Set(
      tags.filter(t => t.tag_type === 'help').map(t => t.tag)
    );
    
    roll.hinderTags = new Set(
      tags.filter(t => t.tag_type === 'hinder').map(t => t.tag)
    );
    
    roll.burnedTags = new Set(
      tags.filter(t => t.tag_type === 'help' && t.is_burned === 1).map(t => t.tag)
    );
    
    return roll;
  }

  /**
   * Update a roll
   * @param {number} rollId - Roll ID
   * @param {Object} updates - Updates to apply
   * @returns {Object|null} Updated roll or null if not found
   */
  static updateRoll(rollId, updates) {
    // Verify roll exists
    const verifyStmt = db.prepare('SELECT id FROM rolls WHERE id = ?');
    if (!verifyStmt.get(rollId)) {
      return null;
    }
    
    const transaction = db.transaction(() => {
      // Build update query dynamically
      const updateFields = [];
      const updateValues = [];
      
      if (updates.status !== undefined) {
        updateFields.push('status = ?');
        updateValues.push(updates.status);
      }
      
      if (updates.description !== undefined) {
        updateFields.push('description = ?');
        updateValues.push(updates.description);
      }
      
      if (updates.confirmedBy !== undefined) {
        updateFields.push('confirmed_by = ?');
        updateValues.push(updates.confirmedBy);
      }
      
      if (updateFields.length > 0) {
        updateFields.push('updated_at = strftime(\'%s\', \'now\')');
        updateValues.push(rollId);
        
        const updateSql = `UPDATE rolls SET ${updateFields.join(', ')} WHERE id = ?`;
        db.prepare(updateSql).run(...updateValues);
      }
      
      // Update tags if provided
      if (updates.helpTags !== undefined || updates.hinderTags !== undefined || updates.burnedTags !== undefined) {
        // Delete existing tags
        db.prepare('DELETE FROM roll_tags WHERE roll_id = ?').run(rollId);
        
        // Insert new tags
        const insertTag = db.prepare(`
          INSERT INTO roll_tags (roll_id, tag, tag_type, is_burned)
          VALUES (?, ?, ?, ?)
        `);
        
        const burnedTagsSet = updates.burnedTags instanceof Set 
          ? updates.burnedTags 
          : new Set(updates.burnedTags || []);
        
        if (updates.helpTags) {
          const helpTagsArray = updates.helpTags instanceof Set 
            ? Array.from(updates.helpTags) 
            : updates.helpTags;
          
          helpTagsArray.forEach(tag => {
            const isBurned = burnedTagsSet.has(tag) ? 1 : 0;
            insertTag.run(rollId, tag, 'help', isBurned);
          });
        }
        
        if (updates.hinderTags) {
          const hinderTagsArray = updates.hinderTags instanceof Set 
            ? Array.from(updates.hinderTags) 
            : updates.hinderTags;
          
          hinderTagsArray.forEach(tag => {
            insertTag.run(rollId, tag, 'hinder', 0);
          });
        }
      }
    });
    
    transaction();
    return this.getRoll(rollId);
  }

  /**
   * Delete a roll
   * @param {number} rollId - Roll ID
   * @returns {boolean} True if deleted, false if not found
   */
  static deleteRoll(rollId) {
    const stmt = db.prepare('DELETE FROM rolls WHERE id = ?');
    const result = stmt.run(rollId);
    return result.changes > 0;
  }

  /**
   * Get all rolls for a scene
   * @param {string} sceneId - Scene/channel ID
   * @returns {Array} Array of roll objects
   */
  static getRollsByScene(sceneId) {
    const stmt = db.prepare(`
      SELECT id
      FROM rolls
      WHERE scene_id = ?
      ORDER BY created_at DESC
    `);
    
    const rollIds = stmt.all(sceneId);
    return rollIds.map(row => this.getRoll(row.id));
  }

  /**
   * Get all rolls by status
   * @param {string} status - Roll status
   * @returns {Array} Array of roll objects
   */
  static getRollsByStatus(status) {
    const stmt = db.prepare(`
      SELECT id
      FROM rolls
      WHERE status = ?
      ORDER BY created_at DESC
    `);
    
    const rollIds = stmt.all(status);
    return rollIds.map(row => this.getRoll(row.id));
  }
}
