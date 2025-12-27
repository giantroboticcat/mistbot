import { RollTagParentType } from '../constants/RollTagParentType.js';
import { RollTagEntityConverter } from './RollTagEntityConverter.js';
import { CharacterStorage } from './CharacterStorage.js';
import { StoryTagStorage } from './StoryTagStorage.js';
import { FellowshipStorage } from './FellowshipStorage.js';

/**
 * Represents a tag entity in the roll system
 * This replaces tag strings (e.g., "theme:Tinkerer") with structured objects
 */
export class TagEntity {
  /**
   * @param {string} parentType - One of RollTagParentType constants
   * @param {number} parentId - The ID of the parent entity
   * @param {number|null} characterId - Character ID if this tag belongs to a character (null for scene/fellowship tags)
   */
  constructor(parentType, parentId, characterId = null) {
    this.parentType = parentType;
    this.parentId = parentId;
    this.characterId = characterId;
  }

  /**
   * Create a TagEntity from a tag string (for backward compatibility during migration)
   * @param {string} tagString - Tag string like "theme:Tinkerer"
   * @param {number} characterId - Character ID for character-related tags (used for parsing, not stored)
   * @param {string} sceneId - Scene ID for scene-related tags
   * @param {string} guildId - Guild ID for database access
   * @returns {TagEntity|null} TagEntity or null if not found
   */
  static fromTagString(tagString, characterId, sceneId, guildId) {
    const entityInfo = RollTagEntityConverter.parseTagString(tagString, characterId, sceneId, guildId);
    if (!entityInfo) {
      return null;
    }
    
    // Get character_id from the entity if it's character-related
    const characterIdForEntity = RollTagEntityConverter.getCharacterIdFromEntity(
      entityInfo.parent_type,
      entityInfo.parent_id,
      guildId
    );
    
    return new TagEntity(entityInfo.parent_type, entityInfo.parent_id, characterIdForEntity);
  }

  /**
   * Convert TagEntity to a tag string (for backward compatibility)
   * @param {string} guildId - Guild ID for database access
   * @returns {string|null} Tag string or null if conversion fails
   */
  toTagString(guildId) {
    return RollTagEntityConverter.entityToTagString(
      { parent_type: this.parentType, parent_id: this.parentId },
      guildId
    );
  }

  /**
   * Check if two TagEntities are equal
   * @param {TagEntity} other - Other TagEntity to compare
   * @returns {boolean} True if equal
   */
  equals(other) {
    if (!(other instanceof TagEntity)) {
      return false;
    }
    return this.parentType === other.parentType && this.parentId === other.parentId;
  }

  /**
   * Get a unique key for this entity (for use in Sets/Maps)
   * @returns {string} Unique key
   */
  getKey() {
    return `${this.parentType}:${this.parentId}`;
  }

  /**
   * Check if this tag is from a character (not scene/fellowship)
   * @returns {boolean} True if from a character
   */
  isFromCharacter() {
    return this.characterId !== null;
  }

  /**
   * Check if this tag is a weakness
   * @param {string} guildId - Guild ID for database access
   * @returns {boolean} True if this is a weakness
   */
  isWeakness(guildId) {
    const { getDbForGuild } = require('./Database.js');
    const db = getDbForGuild(guildId);
    
    if (this.parentType === RollTagParentType.CHARACTER_THEME_TAG) {
      const stmt = db.prepare('SELECT is_weakness FROM character_theme_tags WHERE id = ?');
      const result = stmt.get(this.parentId);
      return result && result.is_weakness === 1;
    }
    if (this.parentType === RollTagParentType.FELLOWSHIP_TAG) {
      const stmt = db.prepare('SELECT is_weakness FROM fellowship_tags WHERE id = ?');
      const result = stmt.get(this.parentId);
      return result && result.is_weakness === 1;
    }
    return false;
  }

  /**
   * Get tag data from storage classes
   * @param {string} guildId - Guild ID for database access
   * @returns {Object|null} { name: string, type: 'tag'|'status'|'weakness', isWeakness: boolean, characterId: number|null } or null
   */
  getTagData(guildId) {
    switch (this.parentType) {
      case RollTagParentType.CHARACTER_THEME:
      case RollTagParentType.CHARACTER_THEME_TAG:
      case RollTagParentType.CHARACTER_BACKPACK:
      case RollTagParentType.CHARACTER_STORY_TAG:
      case RollTagParentType.CHARACTER_STATUS:
        return CharacterStorage.getTagDataByEntity(guildId, this.parentType, this.parentId);
      
      case RollTagParentType.SCENE_TAG:
        return StoryTagStorage.getTagDataByEntity(guildId, this.parentId);
      
      case RollTagParentType.FELLOWSHIP_TAG:
        return FellowshipStorage.getTagDataByEntity(guildId, this.parentId);
      
      default:
        return null;
    }
  }

  /**
   * Get tag info for modifier calculation
   * @param {string} guildId - Guild ID for database access
   * @returns {Object|null} { tagName: string, isStatus: boolean, isWeakness: boolean } or null
   */
  getTagInfo(guildId) {
    const tagData = this.getTagData(guildId);
    if (!tagData) return null;
    
    return {
      tagName: tagData.name,
      isStatus: tagData.type === 'status',
      isWeakness: tagData.isWeakness
    };
  }

  /**
   * Check if this tag is burned
   * @param {Set<TagEntity>} burnedTags - Set of burned tag entities
   * @returns {boolean} True if this tag is burned
   */
  isBurned(burnedTags) {
    for (const burnedTag of burnedTags) {
      if (burnedTag.getKey && burnedTag.getKey() === this.getKey()) {
        return true;
      }
    }
    return false;
  }
}

