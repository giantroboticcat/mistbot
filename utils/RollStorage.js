import { getDbForGuild } from './Database.js';
import RollStatus from '../constants/RollStatus.js';
import { RollTagEntityConverter } from './RollTagEntityConverter.js';
import { TagEntity } from './TagEntity.js';

/**
 * Storage utility for managing roll proposals
 */
export class RollStorage {

  /**
   * Get the next sequential roll ID
   * @param {string} guildId - Discord guild ID
   * @returns {number} Next roll ID
   */
  static getNextId(guildId) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare('SELECT MAX(id) as maxId FROM rolls');
    const result = stmt.get();
    return (result.maxId || 0) + 1;
  }

  /**
   * Create a new roll proposal
   * @param {string} guildId - Discord guild ID
   * @param {Object} rollData - Roll proposal data
   * @returns {number} The roll ID
   */
  static createRoll(guildId, rollData) {
    const db = getDbForGuild(guildId);
    const transaction = db.transaction(() => {
      // Insert roll
      const insertRoll = db.prepare(`
        INSERT INTO rolls (creator_id, character_id, scene_id, description, narration_link, justification_notes, status, reaction_to_roll_id, is_reaction)
        VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?, ?)
      `);
      
      const result = insertRoll.run(
        rollData.creatorId,
        rollData.characterId || null,
        rollData.sceneId,
        rollData.description || null,
        rollData.narrationLink || null,
        rollData.justificationNotes || null,
        rollData.reactionToRollId || null,
        rollData.isReaction ? 1 : 0
      );
      
      const rollId = result.lastInsertRowid;
      
      // Insert TagEntity objects directly
      const insertTag = db.prepare(`
        INSERT INTO roll_tags (
          roll_id, tag_type, is_burned, help_from_character_id, parent_id, parent_type
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      if (rollData.helpTags) {
        const helpTagsArray = rollData.helpTags instanceof Set 
          ? Array.from(rollData.helpTags) 
          : rollData.helpTags;
        
        const burnedTagsSet = rollData.burnedTags instanceof Set 
          ? rollData.burnedTags 
          : new Set(rollData.burnedTags || []);
        
        const helpFromCharacterIdMap = rollData.helpFromCharacterIdMap || new Map();
        
        for (const tagEntity of helpTagsArray) {
          // Check if this TagEntity is burned
          const isBurned = tagEntity.isBurned ? tagEntity.isBurned(burnedTagsSet) : false;
          
          // Get character ID from map (for tags from other characters) or from entity
          const helpFromCharId = helpFromCharacterIdMap.get(tagEntity) || tagEntity.characterId || null;
          
          insertTag.run(
            rollId,
            'help',
            isBurned ? 1 : 0,
            helpFromCharId,
            tagEntity.parentId,
            tagEntity.parentType
          );
        }
      }
      
      // Insert hinder tags
      if (rollData.hinderTags) {
        const hinderTagsArray = rollData.hinderTags instanceof Set 
          ? Array.from(rollData.hinderTags) 
          : rollData.hinderTags;
        
        const hinderFromCharacterIdMap = rollData.hinderFromCharacterIdMap || new Map();
        
        for (const tagEntity of hinderTagsArray) {
          // Get character ID from map (for tags from other characters) or from entity
          const hinderFromCharId = hinderFromCharacterIdMap.get(tagEntity) || tagEntity.characterId || null;
          
          insertTag.run(
            rollId,
            'hinder',
            0,
            hinderFromCharId,
            tagEntity.parentId,
            tagEntity.parentType
          );
        }
      }
      
      return rollId;
    });
    
    return transaction();
  }

  /**
   * Get a roll by ID
   * @param {string} guildId - Discord guild ID
   * @param {number} rollId - Roll ID
   * @returns {Object|null} Roll data or null if not found
   */
  static getRoll(guildId, rollId) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      SELECT id, creator_id, character_id, scene_id, description, narration_link, justification_notes, status, confirmed_by, created_at, updated_at, reaction_to_roll_id, is_reaction
      FROM rolls
      WHERE id = ?
    `);
    
    const roll = stmt.get(rollId);
    if (!roll) {
      return null;
    }
    
    // Load tags with entity IDs
    const tagsStmt = db.prepare(`
      SELECT 
        tag_type, is_burned, help_from_character_id, parent_id, parent_type
      FROM roll_tags
      WHERE roll_id = ?
    `);
    
    const tags = tagsStmt.all(rollId);
    
    // Convert entity IDs back to TagEntity objects
    const helpTags = new Set();
    const hinderTags = new Set();
    const burnedTags = new Set();
    const helpFromCharacterIdMap = new Map();
    
    for (const tag of tags) {
      // Get character ID from the entity
      const characterId = RollTagEntityConverter.getCharacterIdFromEntity(
        tag.parent_type,
        tag.parent_id,
        guildId
      );
      
      const tagEntity = new TagEntity(tag.parent_type, tag.parent_id, characterId);
      
      if (tag.tag_type === 'help') {
        helpTags.add(tagEntity);
        if (tag.is_burned === 1) {
          burnedTags.add(tagEntity);
        }
        // Build map of help tags to their source character ID (if different from entity's characterId)
        if (tag.help_from_character_id !== null && tag.help_from_character_id !== characterId) {
          helpFromCharacterIdMap.set(tagEntity, tag.help_from_character_id);
        }
      } else {
        hinderTags.add(tagEntity);
      }
    }
    
    // Map snake_case to camelCase for JavaScript conventions
    return {
      id: roll.id,
      creatorId: roll.creator_id,
      characterId: roll.character_id,
      sceneId: roll.scene_id,
      description: roll.description,
      narrationLink: roll.narration_link,
      justificationNotes: roll.justification_notes,
      status: roll.status,
      confirmedBy: roll.confirmed_by,
      createdAt: roll.created_at,
      updatedAt: roll.updated_at,
      reactionToRollId: roll.reaction_to_roll_id,
      isReaction: Boolean(roll.is_reaction),
      helpTags: helpTags,
      hinderTags: hinderTags,
      burnedTags: burnedTags,
      helpFromCharacterIdMap: helpFromCharacterIdMap,
    };
  }

  /**
   * Update a roll
   * @param {string} guildId - Discord guild ID
   * @param {number} rollId - Roll ID
   * @param {Object} updates - Updates to apply
   * @returns {Object|null} Updated roll or null if not found
   */
  static updateRoll(guildId, rollId, updates) {
    const db = getDbForGuild(guildId);
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
      if (updates.narrationLink !== undefined) {
        updateFields.push('narration_link = ?');
        updateValues.push(updates.narrationLink);
      }
      if (updates.justificationNotes !== undefined) {
        updateFields.push('justification_notes = ?');
        updateValues.push(updates.justificationNotes);
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
        // Get helpFromCharacterId map if provided, otherwise try to preserve existing ones
        // IMPORTANT: Get existing roll BEFORE deleting tags, so we can preserve helpFromCharacterIdMap
        let helpFromCharacterIdMap = updates.helpFromCharacterIdMap;
        if (!helpFromCharacterIdMap && updates.helpTags) {
          // If not provided, try to preserve existing helpFromCharacterIdMap
          const existingRoll = this.getRoll(guildId, rollId);
          helpFromCharacterIdMap = existingRoll ? existingRoll.helpFromCharacterIdMap : new Map();
        }
        helpFromCharacterIdMap = helpFromCharacterIdMap || new Map();
        
        // Get roll to access character_id and scene_id
        const rollStmt = db.prepare('SELECT character_id, scene_id FROM rolls WHERE id = ?');
        const rollInfo = rollStmt.get(rollId);
        
        // Delete existing tags (after we've loaded the existing data)
        db.prepare('DELETE FROM roll_tags WHERE roll_id = ?').run(rollId);
        
        // Insert new tags
        const insertTag = db.prepare(`
          INSERT INTO roll_tags (
            roll_id, tag_type, is_burned, help_from_character_id, parent_id, parent_type
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        const burnedTagsSet = updates.burnedTags instanceof Set 
          ? updates.burnedTags 
          : new Set(updates.burnedTags || []);
        
        const hinderFromCharacterIdMap = updates.hinderFromCharacterIdMap || new Map();
        
        if (updates.helpTags) {
          const helpTagsArray = updates.helpTags instanceof Set 
            ? Array.from(updates.helpTags) 
            : updates.helpTags;
          
          for (const tagEntity of helpTagsArray) {
            // Check if this TagEntity is burned
            const isBurned = tagEntity.isBurned ? tagEntity.isBurned(burnedTagsSet) : false;
            
            // Get character ID from map (for tags from other characters) or from entity
            const helpFromCharId = helpFromCharacterIdMap.get(tagEntity) || tagEntity.characterId || null;
            
            insertTag.run(
              rollId,
              'help',
              isBurned ? 1 : 0,
              helpFromCharId,
              tagEntity.parentId,
              tagEntity.parentType
            );
          }
        }
        
        if (updates.hinderTags) {
          const hinderTagsArray = updates.hinderTags instanceof Set 
            ? Array.from(updates.hinderTags) 
            : updates.hinderTags;
          
          for (const tagEntity of hinderTagsArray) {
            // Get character ID from map (for tags from other characters) or from entity
            const hinderFromCharId = hinderFromCharacterIdMap.get(tagEntity) || tagEntity.characterId || null;
            
            insertTag.run(
              rollId,
              'hinder',
              0,
              hinderFromCharId,
              tagEntity.parentId,
              tagEntity.parentType
            );
          }
        }
      }
    });
    
    transaction();
    return this.getRoll(guildId, rollId);
  }

  /**
   * Delete a roll
   * @param {string} guildId - Discord guild ID
   * @param {number} rollId - Roll ID
   * @returns {boolean} True if deleted, false if not found
   */
  static deleteRoll(guildId, rollId) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare('DELETE FROM rolls WHERE id = ?');
    const result = stmt.run(rollId);
    return result.changes > 0;
  }

  /**
   * Get all rolls for a scene
   * @param {string} guildId - Discord guild ID
   * @param {string} sceneId - Scene/channel ID
   * @returns {Array} Array of roll objects
   */
  static getRollsByScene(guildId, sceneId) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      SELECT id
      FROM rolls
      WHERE scene_id = ?
      ORDER BY created_at DESC
    `);
    
    const rollIds = stmt.all(sceneId);
    return rollIds.map(row => this.getRoll(guildId, row.id));
  }

  /**
   * Get all rolls by status
   * @param {string} guildId - Discord guild ID
   * @param {string} status - Roll status
   * @returns {Array} Array of roll objects
   */
  static getRollsByStatus(guildId, status) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      SELECT id
      FROM rolls
      WHERE status = ?
      ORDER BY created_at DESC
    `);
    
    const rollIds = stmt.all(status);
    return rollIds.map(row => this.getRoll(guildId, row.id));
  }
}
