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
        INSERT INTO rolls (creator_id, character_id, scene_id, description, narration_link, justification_notes, status, reaction_to_roll_id, is_reaction, might_modifier)
        VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?)
      `);
      
      const result = insertRoll.run(
        rollData.creatorId,
        rollData.characterId || null,
        rollData.sceneId,
        rollData.description || null,
        rollData.narrationLink || null,
        rollData.justificationNotes || null,
        rollData.reactionToRollId || null,
        rollData.isReaction ? 1 : 0,
        rollData.mightModifier !== undefined ? rollData.mightModifier : 0
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
      SELECT id, creator_id, character_id, scene_id, description, narration_link, justification_notes, status, confirmed_by, created_at, updated_at, reaction_to_roll_id, is_reaction, might_modifier
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
    
    // Validate roll_tags and collect invalid ones
    const invalidTags = this.validateRollTags(guildId, tags);
    
    // Convert entity IDs back to TagEntity objects
    const helpTags = new Set();
    const hinderTags = new Set();
    const burnedTags = new Set();
    const helpFromCharacterIdMap = new Map();
    
    for (const tag of tags) {
      // Skip invalid tags (they won't have valid entities)
      if (invalidTags.some(invalid => invalid.parent_id === tag.parent_id && invalid.parent_type === tag.parent_type)) {
        continue;
      }
      
      // Get character ID from the entity (may be null for scene/fellowship tags)
      const characterId = RollTagEntityConverter.getCharacterIdFromEntity(
        tag.parent_type,
        tag.parent_id,
        guildId
      );
      
      // For character-related tags, if characterId is null, the entity doesn't exist
      // (This is already caught by validateRollTags, but double-check for safety)
      if (characterId === null && this.requiresCharacterId(tag.parent_type)) {
        // Entity doesn't exist - skip it (should have been caught by validation)
        continue;
      }
      
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
      mightModifier: roll.might_modifier !== undefined && roll.might_modifier !== null ? roll.might_modifier : 0,
      helpTags: helpTags,
      hinderTags: hinderTags,
      burnedTags: burnedTags,
      helpFromCharacterIdMap: helpFromCharacterIdMap,
      invalidTags: invalidTags, // Include invalid tags for alerting
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
      
      if (updates.mightModifier !== undefined) {
        updateFields.push('might_modifier = ?');
        updateValues.push(updates.mightModifier);
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
   * Validate roll_tags to check if referenced entities still exist
   * @param {string} guildId - Guild ID
   * @param {Array} tags - Array of roll_tag objects
   * @returns {Array} Array of invalid tag objects with { parent_type, parent_id, tag_type, reason }
   */
  static validateRollTags(guildId, tags) {
    const db = getDbForGuild(guildId);
    const invalidTags = [];
    
    for (const tag of tags) {
      let exists = false;
      
      switch (tag.parent_type) {
        case 'character_theme': {
          const stmt = db.prepare('SELECT id FROM character_themes WHERE id = ?');
          exists = !!stmt.get(tag.parent_id);
          break;
        }
        case 'character_theme_tag': {
          const stmt = db.prepare('SELECT id FROM character_theme_tags WHERE id = ?');
          exists = !!stmt.get(tag.parent_id);
          break;
        }
        case 'character_backpack': {
          const stmt = db.prepare('SELECT id FROM character_backpack WHERE id = ?');
          exists = !!stmt.get(tag.parent_id);
          break;
        }
        case 'character_story_tag': {
          const stmt = db.prepare('SELECT id FROM character_story_tags WHERE id = ?');
          exists = !!stmt.get(tag.parent_id);
          break;
        }
        case 'character_status': {
          const stmt = db.prepare('SELECT id FROM character_statuses WHERE id = ?');
          exists = !!stmt.get(tag.parent_id);
          break;
        }
        case 'scene_tag': {
          const stmt = db.prepare('SELECT id FROM scene_tags WHERE id = ?');
          exists = !!stmt.get(tag.parent_id);
          break;
        }
        case 'fellowship_tag': {
          const stmt = db.prepare('SELECT id FROM fellowship_tags WHERE id = ?');
          exists = !!stmt.get(tag.parent_id);
          break;
        }
        default:
          // Unknown parent type
          invalidTags.push({
            parent_type: tag.parent_type,
            parent_id: tag.parent_id,
            tag_type: tag.tag_type,
            reason: `Unknown parent type: ${tag.parent_type}`
          });
          continue;
      }
      
      if (!exists) {
        invalidTags.push({
          parent_type: tag.parent_type,
          parent_id: tag.parent_id,
          tag_type: tag.tag_type,
          reason: `Entity ${tag.parent_type}:${tag.parent_id} no longer exists`
        });
      }
    }
    
    return invalidTags;
  }
  
  /**
   * Check if a parent type requires a character ID
   * @param {string} parentType - Parent type
   * @returns {boolean} True if the parent type should have a character ID
   */
  static requiresCharacterId(parentType) {
    return [
      'character_theme',
      'character_theme_tag',
      'character_backpack',
      'character_story_tag',
      'character_status'
    ].includes(parentType);
  }

  /**
   * Delete invalid roll_tags from a roll
   * @param {string} guildId - Guild ID
   * @param {number} rollId - Roll ID
   * @returns {number} Number of invalid tags deleted
   */
  static deleteInvalidTags(guildId, rollId) {
    const db = getDbForGuild(guildId);
    
    // Get all tags for this roll
    const tagsStmt = db.prepare(`
      SELECT id, parent_id, parent_type
      FROM roll_tags
      WHERE roll_id = ?
    `);
    const tags = tagsStmt.all(rollId);
    
    // Validate tags and collect invalid ones
    const invalidTags = this.validateRollTags(guildId, tags);
    
    if (invalidTags.length === 0) {
      return 0;
    }
    
    // Delete invalid tags
    const deleteStmt = db.prepare('DELETE FROM roll_tags WHERE id = ?');
    let deletedCount = 0;
    
    for (const invalidTag of invalidTags) {
      // Find the roll_tag ID for this invalid tag
      const tagToDelete = tags.find(t => 
        t.parent_id === invalidTag.parent_id && 
        t.parent_type === invalidTag.parent_type
      );
      
      if (tagToDelete) {
        deleteStmt.run(tagToDelete.id);
        deletedCount++;
      }
    }
    
    return deletedCount;
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
