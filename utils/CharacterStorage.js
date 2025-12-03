import { db } from './Database.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Storage utility for managing characters per user
 */
export class CharacterStorage {
  /**
   * Legacy load method for backward compatibility (used by migration)
   * @returns {Object} Map of userId -> { characters: [...] }
   */
  static loadFromJSON() {
    const STORAGE_FILE = join(process.cwd(), 'data', 'characters.json');
    if (!existsSync(STORAGE_FILE)) {
      return {};
    }

    try {
      const data = readFileSync(STORAGE_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading character data from JSON:', error);
      return {};
    }
  }

  /**
   * Get user's characters
   * @param {string} userId - Discord user ID
   * @returns {Array} Array of character objects
   */
  static getUserCharacters(userId) {
    const stmt = db.prepare(`
      SELECT id, user_id, name, is_active, created_at, updated_at
      FROM characters
      WHERE user_id = ?
      ORDER BY id
    `);
    
    const characters = stmt.all(userId);
    
    // Load related data for each character
    return characters.map(char => this.loadCharacterRelations(char));
  }

  /**
   * Load all related data for a character
   * @param {Object} character - Base character object
   * @returns {Object} Character with all related data
   */
  static loadCharacterRelations(character) {
    // Load themes
    const themesStmt = db.prepare(`
      SELECT id, name, theme_order
      FROM character_themes
      WHERE character_id = ?
      ORDER BY theme_order
    `);
    const themes = themesStmt.all(character.id);
    
    // Load tags and weaknesses for each theme
    const tagsStmt = db.prepare(`
      SELECT tag, is_weakness
      FROM character_theme_tags
      WHERE theme_id = ?
    `);
    
    character.themes = themes.map(theme => {
      const allTags = tagsStmt.all(theme.id);
      return {
        name: theme.name,
        tags: allTags.filter(t => !t.is_weakness).map(t => t.tag),
        weaknesses: allTags.filter(t => t.is_weakness).map(t => t.tag),
      };
    });
    
    // Load backpack
    const backpackStmt = db.prepare(`
      SELECT item
      FROM character_backpack
      WHERE character_id = ?
    `);
    character.backpack = backpackStmt.all(character.id).map(row => row.item);
    
    // Load story tags
    const storyTagsStmt = db.prepare(`
      SELECT tag
      FROM character_story_tags
      WHERE character_id = ?
    `);
    character.storyTags = storyTagsStmt.all(character.id).map(row => row.tag);
    
    // Load statuses
    const statusesStmt = db.prepare(`
      SELECT status
      FROM character_statuses
      WHERE character_id = ?
    `);
    character.tempStatuses = statusesStmt.all(character.id).map(row => row.status);
    
    // Load burned tags
    const burnedTagsStmt = db.prepare(`
      SELECT tag
      FROM character_burned_tags
      WHERE character_id = ?
    `);
    character.burnedTags = burnedTagsStmt.all(character.id).map(row => row.tag);
    
    return character;
  }

  /**
   * Get the active character ID for a user
   * @param {string} userId - Discord user ID
   * @returns {number|null} The active character ID or null if none
   */
  static getActiveCharacterId(userId) {
    const stmt = db.prepare(`
      SELECT id
      FROM characters
      WHERE user_id = ? AND is_active = 1
      LIMIT 1
    `);
    
    const result = stmt.get(userId);
    return result ? result.id : null;
  }

  /**
   * Set the active character for a user
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID to set as active
   * @returns {boolean} True if set successfully, false if character not found
   */
  static setActiveCharacter(userId, characterId) {
    // Verify character exists and belongs to user
    const verifyStmt = db.prepare(`
      SELECT id
      FROM characters
      WHERE id = ? AND user_id = ?
    `);
    
    if (!verifyStmt.get(characterId, userId)) {
      return false;
    }
    
    // Use transaction to update
    const transaction = db.transaction(() => {
      // Deactivate all user's characters
      db.prepare(`
        UPDATE characters
        SET is_active = 0
        WHERE user_id = ?
      `).run(userId);
      
      // Activate the selected character
      db.prepare(`
        UPDATE characters
        SET is_active = 1, updated_at = strftime('%s', 'now')
        WHERE id = ?
      `).run(characterId);
    });
    
    transaction();
    return true;
  }

  /**
   * Get active character for a user
   * @param {string} userId - Discord user ID
   * @returns {Object|null} Character object or null if none active
   */
  static getActiveCharacter(userId) {
    const stmt = db.prepare(`
      SELECT id, user_id, name, is_active, created_at, updated_at
      FROM characters
      WHERE user_id = ? AND is_active = 1
      LIMIT 1
    `);
    
    const character = stmt.get(userId);
    return character ? this.loadCharacterRelations(character) : null;
  }

  /**
   * Get a specific character by ID
   * @param {string} userId - Discord user ID (for verification)
   * @param {number} characterId - Character ID
   * @returns {Object|null} Character object or null if not found
   */
  static getCharacter(userId, characterId) {
    const stmt = db.prepare(`
      SELECT id, user_id, name, is_active, created_at, updated_at
      FROM characters
      WHERE id = ? AND user_id = ?
    `);
    
    const character = stmt.get(characterId, userId);
    return character ? this.loadCharacterRelations(character) : null;
  }

  /**
   * Create a new character
   * @param {string} userId - Discord user ID
   * @param {string} name - Character name
   * @param {Array} themes - Array of theme objects { name, tags, weaknesses }
   * @returns {Object} The created character
   */
  static createCharacter(userId, name, themes) {
    const transaction = db.transaction(() => {
      // Insert character
      const insertChar = db.prepare(`
        INSERT INTO characters (user_id, name, is_active)
        VALUES (?, ?, ?)
      `);
      
      // Check if this will be the first character (auto-activate)
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM characters WHERE user_id = ?');
      const isFirst = countStmt.get(userId).count === 0;
      
      const result = insertChar.run(userId, name, isFirst ? 1 : 0);
      const characterId = result.lastInsertRowid;
      
      // Insert themes
      const insertTheme = db.prepare(`
        INSERT INTO character_themes (character_id, name, theme_order)
        VALUES (?, ?, ?)
      `);
      
      const insertTag = db.prepare(`
        INSERT INTO character_theme_tags (theme_id, tag, is_weakness)
        VALUES (?, ?, ?)
      `);
      
      themes.forEach((theme, index) => {
        const themeResult = insertTheme.run(characterId, theme.name, index);
        const themeId = themeResult.lastInsertRowid;
        
        // Insert tags
        if (theme.tags) {
          theme.tags.forEach(tag => {
            insertTag.run(themeId, tag, 0);
          });
        }
        
        // Insert weaknesses
        if (theme.weaknesses) {
          theme.weaknesses.forEach(weakness => {
            insertTag.run(themeId, weakness, 1);
          });
        }
      });
      
      return characterId;
    });
    
    const characterId = transaction();
    return this.getCharacter(userId, characterId);
  }

  /**
   * Update a character
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID
   * @param {Object} updates - Updates to apply
   * @returns {Object|null} Updated character or null if not found
   */
  static updateCharacter(userId, characterId, updates) {
    // Verify character exists and belongs to user
    const verifyStmt = db.prepare('SELECT id FROM characters WHERE id = ? AND user_id = ?');
    if (!verifyStmt.get(characterId, userId)) {
      return null;
    }
    
    const transaction = db.transaction(() => {
      // Update name if provided
      if (updates.name !== undefined) {
        db.prepare(`
          UPDATE characters
          SET name = ?, updated_at = strftime('%s', 'now')
          WHERE id = ?
        `).run(updates.name, characterId);
      }
      
      // Update themes if provided
      if (updates.themes !== undefined) {
        // Delete existing themes and tags
        db.prepare('DELETE FROM character_themes WHERE character_id = ?').run(characterId);
        
        // Insert new themes
        const insertTheme = db.prepare(`
          INSERT INTO character_themes (character_id, name, theme_order)
          VALUES (?, ?, ?)
        `);
        
        const insertTag = db.prepare(`
          INSERT INTO character_theme_tags (theme_id, tag, is_weakness)
          VALUES (?, ?, ?)
        `);
        
        updates.themes.forEach((theme, index) => {
          const themeResult = insertTheme.run(characterId, theme.name, index);
          const themeId = themeResult.lastInsertRowid;
          
          if (theme.tags) {
            theme.tags.forEach(tag => {
              insertTag.run(themeId, tag, 0);
            });
          }
          
          if (theme.weaknesses) {
            theme.weaknesses.forEach(weakness => {
              insertTag.run(themeId, weakness, 1);
            });
          }
        });
      }
      
      // Update backpack if provided
      if (updates.backpack !== undefined) {
        db.prepare('DELETE FROM character_backpack WHERE character_id = ?').run(characterId);
        
        const insertItem = db.prepare(`
          INSERT INTO character_backpack (character_id, item)
          VALUES (?, ?)
        `);
        
        updates.backpack.forEach(item => {
          insertItem.run(characterId, item);
        });
      }
      
      // Update story tags if provided
      if (updates.storyTags !== undefined) {
        db.prepare('DELETE FROM character_story_tags WHERE character_id = ?').run(characterId);
        
        const insertTag = db.prepare(`
          INSERT INTO character_story_tags (character_id, tag)
          VALUES (?, ?)
        `);
        
        updates.storyTags.forEach(tag => {
          insertTag.run(characterId, tag);
        });
      }
      
      // Update statuses if provided
      if (updates.tempStatuses !== undefined) {
        db.prepare('DELETE FROM character_statuses WHERE character_id = ?').run(characterId);
        
        const insertStatus = db.prepare(`
          INSERT INTO character_statuses (character_id, status)
          VALUES (?, ?)
        `);
        
        updates.tempStatuses.forEach(status => {
          insertStatus.run(characterId, status);
        });
      }
      
      // Update burned tags if provided
      if (updates.burnedTags !== undefined) {
        db.prepare('DELETE FROM character_burned_tags WHERE character_id = ?').run(characterId);
        
        const insertBurned = db.prepare(`
          INSERT INTO character_burned_tags (character_id, tag)
          VALUES (?, ?)
        `);
        
        updates.burnedTags.forEach(tag => {
          insertBurned.run(characterId, tag);
        });
      }
    });
    
    transaction();
    return this.getCharacter(userId, characterId);
  }

  /**
   * Delete a character
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID
   * @returns {boolean} True if deleted, false if not found
   */
  static deleteCharacter(userId, characterId) {
    const stmt = db.prepare(`
      DELETE FROM characters
      WHERE id = ? AND user_id = ?
    `);
    
    const result = stmt.run(characterId, userId);
    return result.changes > 0;
  }
}
