import { getDbForGuild } from './Database.js';
import { RollTagParentType } from '../constants/RollTagParentType.js';

/**
 * Utility for converting between tag strings (e.g., "theme:Tinkerer") and entity IDs
 * for the polymorphic roll_tags table
 */
export class RollTagEntityConverter {
  /**
   * Parse a tag string and return entity information
   * @param {string} tagString - Tag string like "theme:Tinkerer", "tag:SomeTag", etc.
   * @param {number} characterId - Character ID for character-related tags
   * @param {string} sceneId - Scene ID for scene-related tags
   * @param {string} guildId - Guild ID for database access
   * @returns {Object|null} { parent_type: string, parent_id: number } or null if not found
   */
  static parseTagString(tagString, characterId, sceneId, guildId) {
    const db = getDbForGuild(guildId);
    
    if (tagString.startsWith('theme:')) {
      const themeName = tagString.replace('theme:', '');
      const stmt = db.prepare(`
        SELECT id FROM character_themes 
        WHERE character_id = ? AND name = ?
      `);
      const result = stmt.get(characterId, themeName);
      return result ? { parent_type: RollTagParentType.CHARACTER_THEME, parent_id: result.id } : null;
    }
    
    if (tagString.startsWith('tag:')) {
      const tagName = tagString.replace('tag:', '');
      const stmt = db.prepare(`
        SELECT ctt.id FROM character_theme_tags ctt
        JOIN character_themes ct ON ctt.theme_id = ct.id
        WHERE ct.character_id = ? AND ctt.tag = ? AND ctt.is_weakness = 0
      `);
      const result = stmt.get(characterId, tagName);
      return result ? { parent_type: RollTagParentType.CHARACTER_THEME_TAG, parent_id: result.id } : null;
    }
    
    if (tagString.startsWith('weakness:')) {
      const weaknessName = tagString.replace('weakness:', '');
      const stmt = db.prepare(`
        SELECT ctt.id FROM character_theme_tags ctt
        JOIN character_themes ct ON ctt.theme_id = ct.id
        WHERE ct.character_id = ? AND ctt.tag = ? AND ctt.is_weakness = 1
      `);
      const result = stmt.get(characterId, weaknessName);
      return result ? { parent_type: RollTagParentType.CHARACTER_THEME_TAG, parent_id: result.id } : null;
    }
    
    if (tagString.startsWith('backpack:')) {
      const itemName = tagString.replace('backpack:', '');
      const stmt = db.prepare(`
        SELECT id FROM character_backpack 
        WHERE character_id = ? AND item = ?
      `);
      const result = stmt.get(characterId, itemName);
      return result ? { parent_type: RollTagParentType.CHARACTER_BACKPACK, parent_id: result.id } : null;
    }
    
    if (tagString.startsWith('story:')) {
      const tagName = tagString.replace('story:', '');
      const stmt = db.prepare(`
        SELECT id FROM character_story_tags 
        WHERE character_id = ? AND tag = ?
      `);
      const result = stmt.get(characterId, tagName);
      return result ? { parent_type: RollTagParentType.CHARACTER_STORY_TAG, parent_id: result.id } : null;
    }
    
    if (tagString.startsWith('tempStatus:')) {
      const statusDisplay = tagString.replace('tempStatus:', '');
      // Parse status name (remove power level suffix like "-3")
      const statusName = statusDisplay.includes('-') 
        ? statusDisplay.substring(0, statusDisplay.lastIndexOf('-'))
        : statusDisplay;
      const stmt = db.prepare(`
        SELECT id FROM character_statuses 
        WHERE character_id = ? AND status = ?
      `);
      const result = stmt.get(characterId, statusName);
      return result ? { parent_type: RollTagParentType.CHARACTER_STATUS, parent_id: result.id } : null;
    }
    
    if (tagString.startsWith('sceneTag:')) {
      const tagName = tagString.replace('sceneTag:', '');
      const stmt = db.prepare(`
        SELECT id FROM scene_tags 
        WHERE scene_id = ? AND tag = ? AND tag_type = 'tag'
      `);
      const result = stmt.get(sceneId, tagName);
      return result ? { parent_type: RollTagParentType.SCENE_TAG, parent_id: result.id } : null;
    }
    
    if (tagString.startsWith('sceneStatus:')) {
      const statusName = tagString.replace('sceneStatus:', '');
      const stmt = db.prepare(`
        SELECT id FROM scene_tags 
        WHERE scene_id = ? AND tag = ? AND tag_type = 'status'
      `);
      const result = stmt.get(sceneId, statusName);
      return result ? { parent_type: RollTagParentType.SCENE_TAG, parent_id: result.id } : null;
    }
    
    if (tagString.startsWith('fellowship:')) {
      const tagName = tagString.replace('fellowship:', '');
      const stmt = db.prepare(`
        SELECT ft.id FROM fellowship_tags ft
        JOIN characters c ON c.fellowship_id = ft.fellowship_id
        WHERE c.id = ? AND ft.tag = ? AND ft.is_weakness = 0
      `);
      const result = stmt.get(characterId, tagName);
      return result ? { parent_type: RollTagParentType.FELLOWSHIP_TAG, parent_id: result.id } : null;
    }
    
    if (tagString.startsWith('fellowshipWeakness:')) {
      const weaknessName = tagString.replace('fellowshipWeakness:', '');
      const stmt = db.prepare(`
        SELECT ft.id FROM fellowship_tags ft
        JOIN characters c ON c.fellowship_id = ft.fellowship_id
        WHERE c.id = ? AND ft.tag = ? AND ft.is_weakness = 1
      `);
      const result = stmt.get(characterId, weaknessName);
      return result ? { parent_type: RollTagParentType.FELLOWSHIP_TAG, parent_id: result.id } : null;
    }
    
    return null;
  }
  
  /**
   * Convert entity ID back to tag string
   * @param {Object} entityInfo - { parent_type: string, parent_id: number }
   * @param {string} guildId - Guild ID for database access
   * @returns {string|null} Tag string or null if not found
   */
  static entityToTagString(entityInfo, guildId) {
    const db = getDbForGuild(guildId);
    
    switch (entityInfo.parent_type) {
      case RollTagParentType.CHARACTER_THEME: {
        const stmt = db.prepare('SELECT name FROM character_themes WHERE id = ?');
        const result = stmt.get(entityInfo.parent_id);
        return result ? `theme:${result.name}` : null;
      }
      
      case RollTagParentType.CHARACTER_THEME_TAG: {
        const stmt = db.prepare(`
          SELECT ctt.tag, ctt.is_weakness FROM character_theme_tags ctt WHERE id = ?
        `);
        const result = stmt.get(entityInfo.parent_id);
        if (!result) return null;
        return result.is_weakness === 1 
          ? `weakness:${result.tag}`
          : `tag:${result.tag}`;
      }
      
      case RollTagParentType.CHARACTER_BACKPACK: {
        const stmt = db.prepare('SELECT item FROM character_backpack WHERE id = ?');
        const result = stmt.get(entityInfo.parent_id);
        return result ? `backpack:${result.item}` : null;
      }
      
      case RollTagParentType.CHARACTER_STORY_TAG: {
        const stmt = db.prepare('SELECT tag FROM character_story_tags WHERE id = ?');
        const result = stmt.get(entityInfo.parent_id);
        return result ? `story:${result.tag}` : null;
      }
      
      case RollTagParentType.CHARACTER_STATUS: {
        const stmt = db.prepare(`
          SELECT status, power_1, power_2, power_3, power_4, power_5, power_6 
          FROM character_statuses WHERE id = ?
        `);
        const result = stmt.get(entityInfo.parent_id);
        if (!result) return null;
        // Find highest power level
        let highestPower = 0;
        for (let p = 6; p >= 1; p--) {
          if (result[`power_${p}`] === 1) {
            highestPower = p;
            break;
          }
        }
        const statusDisplay = highestPower > 0 
          ? `${result.status}-${highestPower}`
          : result.status;
        return `tempStatus:${statusDisplay}`;
      }
      
      case RollTagParentType.SCENE_TAG: {
        const stmt = db.prepare('SELECT tag, tag_type FROM scene_tags WHERE id = ?');
        const result = stmt.get(entityInfo.parent_id);
        if (!result) return null;
        return result.tag_type === 'status'
          ? `sceneStatus:${result.tag}`
          : `sceneTag:${result.tag}`;
      }
      
      case RollTagParentType.FELLOWSHIP_TAG: {
        const stmt = db.prepare(`
          SELECT ft.tag, ft.is_weakness FROM fellowship_tags ft WHERE id = ?
        `);
        const result = stmt.get(entityInfo.parent_id);
        if (!result) return null;
        return result.is_weakness === 1 
          ? `fellowshipWeakness:${result.tag}`
          : `fellowship:${result.tag}`;
      }
      
      default:
        return null;
    }
  }
  
  /**
   * Convert a set of tag strings to entity info objects
   * @param {Set<string>|Array<string>} tagStrings - Tag strings
   * @param {number} characterId - Character ID
   * @param {string} sceneId - Scene ID
   * @param {string} guildId - Guild ID
   * @returns {Array<Object>} Array of { parent_type, parent_id, originalTag } objects
   */
  static tagStringsToEntities(tagStrings, characterId, sceneId, guildId) {
    const tagArray = tagStrings instanceof Set ? Array.from(tagStrings) : tagStrings;
    const entities = [];
    
    for (const tagString of tagArray) {
      const entityInfo = this.parseTagString(tagString, characterId, sceneId, guildId);
      if (entityInfo) {
        entities.push({ ...entityInfo, originalTag: tagString });
      }
    }
    
    return entities;
  }
  
  /**
   * Convert entity info objects back to tag strings
   * @param {Array<Object>} entities - Array of { parent_type, parent_id } objects
   * @param {string} guildId - Guild ID
   * @returns {Set<string>} Set of tag strings
   */
  static entitiesToTagStrings(entities, guildId) {
    const tagStrings = new Set();
    
    for (const entity of entities) {
      const tagString = this.entityToTagString(entity, guildId);
      if (tagString) {
        tagStrings.add(tagString);
      }
    }
    
    return tagStrings;
  }
}

