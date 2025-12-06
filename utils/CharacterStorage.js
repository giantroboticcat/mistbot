import { db } from './Database.js';
import sheetsService from './GoogleSheetsService.js';
import { FellowshipStorage } from './FellowshipStorage.js';

/**
 * Storage utility for managing characters per user
 */
export class CharacterStorage {

  /**
   * Get user's characters
   * @param {string} userId - Discord user ID
   * @returns {Array} Array of character objects
   */
  static getUserCharacters(userId) {
    const stmt = db.prepare(`
      SELECT id, user_id, name, is_active, created_at, updated_at, google_sheet_url, fellowship_id
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
      SELECT id, name, theme_order, is_burned
      FROM character_themes
      WHERE character_id = ?
      ORDER BY theme_order
    `);
    const themes = themesStmt.all(character.id);
    
    // Load tags and weaknesses for each theme
    const tagsStmt = db.prepare(`
      SELECT tag, is_weakness, is_burned
      FROM character_theme_tags
      WHERE theme_id = ?
    `);
    
    character.themes = themes.map(theme => {
      const allTags = tagsStmt.all(theme.id);
      return {
        name: theme.name,
        isBurned: Boolean(theme.is_burned),
        tags: allTags.filter(t => !t.is_weakness).map(t => ({ 
          tag: t.tag, 
          isBurned: Boolean(t.is_burned) 
        })),
        weaknesses: allTags.filter(t => t.is_weakness).map(t => ({ 
          tag: t.tag, 
          isBurned: Boolean(t.is_burned) 
        })),
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
    
    // Load statuses with power levels
    const statusesStmt = db.prepare(`
      SELECT status, power_1, power_2, power_3, power_4, power_5, power_6
      FROM character_statuses
      WHERE character_id = ?
    `);
    character.tempStatuses = statusesStmt.all(character.id).map(row => ({
      status: row.status,
      powerLevels: {
        1: Boolean(row.power_1),
        2: Boolean(row.power_2),
        3: Boolean(row.power_3),
        4: Boolean(row.power_4),
        5: Boolean(row.power_5),
        6: Boolean(row.power_6),
      }
    }));
    
    // Load fellowship if assigned
    if (character.fellowship_id) {
      character.fellowship = FellowshipStorage.getFellowship(character.fellowship_id);
    } else {
      character.fellowship = null;
    }
    
    return character;
  }

  /**
   * Get the active character ID for a user
   * @param {string} userId - Discord user ID
   * @returns {number|null} The active character ID or null if none
   */
  static getActiveCharacterId(userId) {
    const stmt = db.prepare(`
      SELECT id, google_sheet_url, fellowship_id
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
      SELECT id, user_id, name, is_active, created_at, updated_at, google_sheet_url, fellowship_id
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
      SELECT id, user_id, name, is_active, created_at, updated_at, google_sheet_url, fellowship_id
      FROM characters
      WHERE id = ? AND user_id = ?
    `);
    
    const character = stmt.get(characterId, userId);
    return character ? this.loadCharacterRelations(character) : null;
  }

  /**
   * Set fellowship for a character
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID
   * @param {number|null} fellowshipId - Fellowship ID to assign, or null to remove
   * @returns {boolean} True if updated, false if not found
   */
  static setFellowship(userId, characterId, fellowshipId) {
    const stmt = db.prepare(`
      UPDATE characters
      SET fellowship_id = ?, updated_at = strftime('%s', 'now')
      WHERE id = ? AND user_id = ?
    `);
    
    const result = stmt.run(fellowshipId, characterId, userId);
    return result.changes > 0;
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
        INSERT INTO character_theme_tags (theme_id, tag, is_weakness, is_burned)
        VALUES (?, ?, ?, ?)
      `);
      
      themes.forEach((theme, index) => {
        const themeBurned = theme.isBurned ? 1 : 0;
        const themeResult = db.prepare(`
          INSERT INTO character_themes (character_id, name, theme_order, is_burned)
          VALUES (?, ?, ?, ?)
        `).run(characterId, theme.name, index, themeBurned);
        const themeId = themeResult.lastInsertRowid;
        
        // Insert tags
        if (theme.tags) {
          theme.tags.forEach(tagObj => {
            const tagText = typeof tagObj === 'string' ? tagObj : tagObj.tag;
            const isBurned = typeof tagObj === 'object' ? (tagObj.isBurned ? 1 : 0) : 0;
            insertTag.run(themeId, tagText, 0, isBurned);
          });
        }
        
        // Insert weaknesses
        if (theme.weaknesses) {
          theme.weaknesses.forEach(weaknessObj => {
            const weaknessText = typeof weaknessObj === 'string' ? weaknessObj : weaknessObj.tag;
            const isBurned = typeof weaknessObj === 'object' ? (weaknessObj.isBurned ? 1 : 0) : 0;
            insertTag.run(themeId, weaknessText, 1, isBurned);
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
          INSERT INTO character_themes (character_id, name, theme_order, is_burned)
          VALUES (?, ?, ?, ?)
        `);
        
        const insertTag = db.prepare(`
          INSERT INTO character_theme_tags (theme_id, tag, is_weakness, is_burned)
          VALUES (?, ?, ?, ?)
        `);
        
        updates.themes.forEach((theme, index) => {
          const themeBurned = theme.isBurned ? 1 : 0;
          const themeResult = db.prepare(`
            INSERT INTO character_themes (character_id, name, theme_order, is_burned)
            VALUES (?, ?, ?, ?)
          `).run(characterId, theme.name, index, themeBurned);
          const themeId = themeResult.lastInsertRowid;
          
          if (theme.tags) {
            theme.tags.forEach(tagObj => {
              const tagText = typeof tagObj === 'string' ? tagObj : tagObj.tag;
              const isBurned = typeof tagObj === 'object' ? (tagObj.isBurned ? 1 : 0) : 0;
              insertTag.run(themeId, tagText, 0, isBurned);
            });
          }
          
          if (theme.weaknesses) {
            theme.weaknesses.forEach(weaknessObj => {
              const weaknessText = typeof weaknessObj === 'string' ? weaknessObj : weaknessObj.tag;
              const isBurned = typeof weaknessObj === 'object' ? (weaknessObj.isBurned ? 1 : 0) : 0;
              insertTag.run(themeId, weaknessText, 1, isBurned);
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
          INSERT INTO character_statuses (character_id, status, power_1, power_2, power_3, power_4, power_5, power_6)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        updates.tempStatuses.forEach(statusObj => {
          const statusText = typeof statusObj === 'string' ? statusObj : statusObj.status;
          const powers = typeof statusObj === 'object' && statusObj.powerLevels ? statusObj.powerLevels : {};
          insertStatus.run(
            characterId,
            statusText,
            powers[1] ? 1 : 0,
            powers[2] ? 1 : 0,
            powers[3] ? 1 : 0,
            powers[4] ? 1 : 0,
            powers[5] ? 1 : 0,
            powers[6] ? 1 : 0
          );
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

  /**
   * Set Google Sheet URL for a character
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID
   * @param {string} sheetUrl - Google Sheets URL
   * @returns {boolean} True if updated, false if not found
   */
  static setSheetUrl(userId, characterId, sheetUrl) {
    const stmt = db.prepare(`
      UPDATE characters
      SET google_sheet_url = ?, updated_at = strftime('%s', 'now')
      WHERE id = ? AND user_id = ?
    `);
    
    const result = stmt.run(sheetUrl, characterId, userId);
    return result.changes > 0;
  }

  /**
   * Get Google Sheet URL for a character
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID
   * @returns {string|null} Sheet URL or null if not set
   */
  static getSheetUrl(userId, characterId) {
    const stmt = db.prepare(`
      SELECT google_sheet_url
      FROM characters
      WHERE id = ? AND user_id = ?
    `);
    
    const result = stmt.get(characterId, userId);
    return result?.google_sheet_url || null;
  }

  /**
   * Sync character data TO Google Sheet
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID
   * @returns {Promise<Object>} Result with success status and message
   */
  static async syncToSheet(userId, characterId) {
    try {
      // Get character
      const character = this.getCharacter(userId, characterId);
      if (!character) {
        return { success: false, message: 'Character not found' };
      }

      // Check if sheet URL is set
      if (!character.google_sheet_url) {
        return { success: false, message: 'No Google Sheet URL configured for this character.' };
      }

      // Check if sheets service is ready
      if (!sheetsService.isReady()) {
        return { success: false, message: 'Google Sheets service not initialized. Check GOOGLE_SHEETS_SETUP.md for setup instructions.' };
      }

      // Write to sheet
      await sheetsService.writeCharacterToSheet(character.google_sheet_url, character);

      return { success: true, message: 'Character successfully synced to Google Sheet!' };
    } catch (error) {
      console.error('Error syncing to sheet:', error);
      return { success: false, message: `Failed to sync: ${error.message}` };
    }
  }

  /**
   * Sync character data FROM Google Sheet
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID
   * @returns {Promise<Object>} Result with success status and message
   */
  static async syncFromSheet(userId, characterId) {
    try {
      // Get character to get sheet URL
      const character = this.getCharacter(userId, characterId);
      if (!character) {
        return { success: false, message: 'Character not found' };
      }

      // Check if sheet URL is set
      if (!character.google_sheet_url) {
        return { success: false, message: 'No Google Sheet URL configured for this character.' };
      }

      // Check if sheets service is ready
      if (!sheetsService.isReady()) {
        return { success: false, message: 'Google Sheets service not initialized. Check GOOGLE_SHEETS_SETUP.md for setup instructions.' };
      }

      // Read from sheet
      const sheetData = await sheetsService.readCharacterFromSheet(character.google_sheet_url);

      // Look up fellowship if fellowship name is provided
      let fellowshipId = null;
      if (sheetData.fellowshipName) {
        const fellowship = FellowshipStorage.getFellowshipByName(sheetData.fellowshipName);
        if (fellowship) {
          fellowshipId = fellowship.id;
        } else {
          console.warn(`Fellowship "${sheetData.fellowshipName}" not found in database. Character will not be assigned to a fellowship.`);
        }
      }

      // Update character in database
      const updates = {
        name: sheetData.name,
        themes: sheetData.themes,
        backpack: sheetData.backpack,
        storyTags: sheetData.storyTags,
        tempStatuses: sheetData.tempStatuses,
        burnedTags: sheetData.burnedTags,
      };

      const updatedCharacter = this.updateCharacter(userId, characterId, updates);
      
      // Set fellowship if found
      if (fellowshipId !== null) {
        this.setFellowship(userId, characterId, fellowshipId);
      } else if (updatedCharacter && updatedCharacter.fellowship_id) {
        // If no fellowship name in sheet but character has one, remove it
        this.setFellowship(userId, characterId, null);
      }

      return { success: true, message: 'Character successfully synced from Google Sheet!' };
    } catch (error) {
      console.error('Error syncing from sheet:', error);
      return { success: false, message: `Failed to sync: ${error.message}` };
    }
  }
}
