import { getDbForGuild } from './Database.js';
import sheetsService from './GoogleSheetsService.js';
import { FellowshipStorage } from './FellowshipStorage.js';
import { RollTagParentType } from '../constants/RollTagParentType.js';
import { Validation } from './Validation.js';

/**
 * Storage utility for managing characters per user
 */
export class CharacterStorage {

  /**
   * Get user's characters
   * @param {string} guildId - Discord guild ID
   * @param {string} userId - Discord user ID
   * @returns {Array} Array of character objects
   */
  static getUserCharacters(guildId, userId) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      SELECT id, user_id, name, is_active, created_at, updated_at, google_sheet_url, fellowship_id, auto_sync
      FROM characters
      WHERE user_id = ?
      ORDER BY id
    `);
    
    const characters = stmt.all(userId);
    
    // Load related data for each character
    return characters.map(char => this.loadCharacterRelations(guildId, char));
  }

  /**
   * Get all characters in a guild
   * @param {string} guildId - Discord guild ID
   * @returns {Array} Array of character objects
   */
  static getAllCharacters(guildId) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      SELECT id, user_id, name, is_active, created_at, updated_at, google_sheet_url, fellowship_id, auto_sync
      FROM characters
      ORDER BY user_id, id
    `);
    
    const characters = stmt.all();
    
    // Load related data for each character
    return characters.map(char => this.loadCharacterRelations(guildId, char));
  }

  /**
   * Load all related data for a character
   * @param {string} guildId - Discord guild ID
   * @param {Object} character - Base character object
   * @returns {Object} Character with all related data
   */
  static loadCharacterRelations(guildId, character) {
    const db = getDbForGuild(guildId);
    // Load themes
    const themesStmt = db.prepare(`
      SELECT id, name, theme_order, is_burned, improvements
      FROM character_themes
      WHERE character_id = ?
      ORDER BY theme_order
    `);
    const themes = themesStmt.all(character.id);
    
    // Load tags and weaknesses for each theme (include IDs)
    const tagsStmt = db.prepare(`
      SELECT id, tag, is_weakness, is_burned
      FROM character_theme_tags
      WHERE theme_id = ?
    `);
    
    character.themes = themes.map(theme => {
      const allTags = tagsStmt.all(theme.id);
      return {
        id: theme.id,
        name: theme.name,
        isBurned: Boolean(theme.is_burned),
        improvements: theme.improvements || 0,
        tags: allTags.filter(t => !t.is_weakness).map(t => ({ 
          id: t.id,
          tag: t.tag, 
          isBurned: Boolean(t.is_burned) 
        })),
        weaknesses: allTags.filter(t => t.is_weakness).map(t => ({ 
          id: t.id,
          tag: t.tag, 
          isBurned: Boolean(t.is_burned) 
        })),
      };
    });
    
    // Load backpack (include IDs)
    const backpackStmt = db.prepare(`
      SELECT id, item
      FROM character_backpack
      WHERE character_id = ?
    `);
    character.backpack = backpackStmt.all(character.id).map(row => ({
      id: row.id,
      item: row.item
    }));
    
    // Load story tags (include IDs)
    const storyTagsStmt = db.prepare(`
      SELECT id, tag
      FROM character_story_tags
      WHERE character_id = ?
    `);
    character.storyTags = storyTagsStmt.all(character.id).map(row => ({
      id: row.id,
      tag: row.tag
    }));
    
    // Load statuses with power levels (include IDs)
    const statusesStmt = db.prepare(`
      SELECT id, status, power_1, power_2, power_3, power_4, power_5, power_6
      FROM character_statuses
      WHERE character_id = ?
    `);
    character.tempStatuses = statusesStmt.all(character.id).map(row => ({
      id: row.id,
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
      character.fellowship = FellowshipStorage.getFellowship(guildId, character.fellowship_id);
    } else {
      character.fellowship = null;
    }
    
    return character;
  }

  /**
   * Get tag data by entity ID for roll display/calculation
   * @param {string} guildId - Guild ID
   * @param {string} parentType - RollTagParentType constant
   * @param {number} parentId - Entity ID
   * @returns {Object|null} { name: string, type: 'tag'|'status'|'weakness', isWeakness: boolean, characterId: number|null } or null
   */
  static getTagDataByEntity(guildId, parentType, parentId) {
    const db = getDbForGuild(guildId);

    switch (parentType) {
      case RollTagParentType.CHARACTER_THEME: {
        const stmt = db.prepare('SELECT name, character_id FROM character_themes WHERE id = ?');
        const result = stmt.get(parentId);
        if (!result) return null;
        return {
          name: result.name,
          type: Validation.validateStatus(result.name).valid ? 'status' : 'tag',
          isWeakness: false,
          characterId: result.character_id
        };
      }
      
      case RollTagParentType.CHARACTER_THEME_TAG: {
        const stmt = db.prepare(`
          SELECT ctt.tag, ctt.is_weakness, ct.character_id 
          FROM character_theme_tags ctt
          JOIN character_themes ct ON ctt.theme_id = ct.id
          WHERE ctt.id = ?
        `);
        const result = stmt.get(parentId);
        if (!result) return null;
        return {
          name: result.tag,
          type: result.is_weakness === 1 ? 'weakness' : 'tag',
          isWeakness: result.is_weakness === 1,
          characterId: result.character_id
        };
      }
      
      case RollTagParentType.CHARACTER_BACKPACK: {
        const stmt = db.prepare('SELECT item, character_id FROM character_backpack WHERE id = ?');
        const result = stmt.get(parentId);
        if (!result) return null;
        return {
          name: result.item,
          type: Validation.validateStatus(result.item).valid ? 'status' : 'tag',
          isWeakness: false,
          characterId: result.character_id
        };
      }
      
      case RollTagParentType.CHARACTER_STORY_TAG: {
        const stmt = db.prepare('SELECT tag, character_id FROM character_story_tags WHERE id = ?');
        const result = stmt.get(parentId);
        if (!result) return null;
        return {
          name: result.tag,
          type: Validation.validateStatus(result.tag).valid ? 'status' : 'tag',
          isWeakness: false,
          characterId: result.character_id
        };
      }
      
      case RollTagParentType.CHARACTER_STATUS: {
        const stmt = db.prepare(`
          SELECT status, power_1, power_2, power_3, power_4, power_5, power_6, character_id 
          FROM character_statuses WHERE id = ?
        `);
        const result = stmt.get(parentId);
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
        return {
          name: statusDisplay,
          type: 'status',
          isWeakness: false,
          characterId: result.character_id
        };
      }
      
      default:
        return null;
    }
  }

  /**
   * Get the active character ID for a user
   * @param {string} userId - Discord user ID
   * @returns {number|null} The active character ID or null if none
   */
  static getActiveCharacterId(guildId, userId) {
    const db = getDbForGuild(guildId);
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
  static setActiveCharacter(guildId, userId, characterId) {
    const db = getDbForGuild(guildId);
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
  static getActiveCharacter(guildId, userId) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      SELECT id, user_id, name, is_active, created_at, updated_at, google_sheet_url, fellowship_id, auto_sync
      FROM characters
      WHERE user_id = ? AND is_active = 1
      LIMIT 1
    `);
    
    const character = stmt.get(userId);
    return character ? this.loadCharacterRelations(guildId, character) : null;
  }

  /**
   * Get a specific character by ID
   * @param {string} userId - Discord user ID (for verification)
   * @param {number} characterId - Character ID
   * @returns {Object|null} Character object or null if not found
   */
  static getCharacter(guildId, userId, characterId) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      SELECT id, user_id, name, is_active, created_at, updated_at, google_sheet_url, fellowship_id, auto_sync
      FROM characters
      WHERE id = ? AND user_id = ?
    `);
    
    const character = stmt.get(characterId, userId);
    return character ? this.loadCharacterRelations(guildId, character) : null;
  }

  /**
   * Get a character by ID only (for cases where we don't have userId)
   * @param {string} guildId - Guild ID
   * @param {number} characterId - Character ID
   * @returns {Object|null} Character object or null if not found
   */
  static getCharacterById(guildId, characterId) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      SELECT id, user_id, name, is_active, created_at, updated_at, google_sheet_url, fellowship_id, auto_sync
      FROM characters
      WHERE id = ?
    `);
    
    const character = stmt.get(characterId);
    return character ? this.loadCharacterRelations(guildId, character) : null;
  }

  /**
   * Get character by spreadsheet ID and sheet ID (gid) - optimized for webhook lookups
   * @param {string} guildId - Guild ID
   * @param {string} spreadsheetId - Google Spreadsheet ID
   * @param {string} sheetId - Sheet ID (gid)
   * @returns {Object|null} Character object with minimal fields (id, user_id, name, google_sheet_url, auto_sync) or null
   */
  static getCharacterBySpreadsheetAndGid(guildId, spreadsheetId, sheetId) {
    const db = getDbForGuild(guildId);
    // Query for characters where google_sheet_url contains both the spreadsheet_id and gid=sheetId
    // The gid can appear as #gid=, ?gid=, or &gid= in the URL
    // We use LIKE patterns to find potential matches, then verify exact match by parsing
    const stmt = db.prepare(`
      SELECT id, user_id, name, google_sheet_url, auto_sync
      FROM characters
      WHERE google_sheet_url IS NOT NULL
        AND google_sheet_url LIKE ?
        AND google_sheet_url LIKE ?
      LIMIT 10
    `);
    
    // Match spreadsheet ID in URL: /spreadsheets/d/{spreadsheetId}
    const spreadsheetPattern = `%/spreadsheets/d/${spreadsheetId}%`;
    // Match gid in various formats: #gid=sheetId, ?gid=sheetId, &gid=sheetId
    // Note: We verify exact match after query to avoid partial matches (e.g., gid=12 matching gid=123)
    const gidPattern1 = `%gid=${sheetId}%`;
    
    const candidates = stmt.all(spreadsheetPattern, gidPattern1);
    
    // Verify exact match by parsing the URL (handles edge cases like gid=123 matching gid=12)
    for (const candidate of candidates) {
      const parsed = sheetsService.parseSpreadsheetUrl(candidate.google_sheet_url);
      if (parsed && parsed.spreadsheetId === spreadsheetId && parsed.gid === sheetId) {
        return candidate;
      }
    }
    
    return null;
  }

  /**
   * Set fellowship for a character
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID
   * @param {number|null} fellowshipId - Fellowship ID to assign, or null to remove
   * @returns {Object|null} Updated character or null if not found
   */
  static setFellowship(guildId, userId, characterId, fellowshipId) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      UPDATE characters
      SET fellowship_id = ?, updated_at = strftime('%s', 'now')
      WHERE id = ? AND user_id = ?
    `);
    
    const result = stmt.run(fellowshipId, characterId, userId);
    if (result.changes === 0) {
      return null;
    }
    
    // Get updated character
    const updatedCharacter = this.getCharacter(guildId, userId, characterId);
    
    // Auto-sync if enabled (store promise so handlers can await it if needed)
    if (updatedCharacter && updatedCharacter.auto_sync === 1) {
      updatedCharacter._autoSyncPromise = this.autoSyncToSheet(guildId, userId, characterId, updatedCharacter);
    }
    
    return updatedCharacter;
  }

  /**
   * Set fellowship for an unassigned character
   * @param {string} guildId - Guild ID
   * @param {number} characterId - Character ID
   * @param {number|null} fellowshipId - Fellowship ID or null to remove
   * @returns {boolean} True if updated, false if not found
   */
  static setFellowshipForUnassigned(guildId, characterId, fellowshipId) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      UPDATE characters
      SET fellowship_id = ?, updated_at = strftime('%s', 'now')
      WHERE id = ? AND user_id IS NULL
    `);
    
    const result = stmt.run(fellowshipId, characterId);
    return result.changes > 0;
  }

  /**
   * Mark themes/tags as burned based on tagValue strings
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID
   * @param {string[]} tagValues - Array of tagValue strings (e.g., ["theme:ThemeName", "tag:TagName"])
   * @returns {Object|null} Updated character or null if not found
   */
  static markTagsAsBurned(guildId, userId, characterId, tagValues) {
    const db = getDbForGuild(guildId);
    // Verify character exists and belongs to user
    const verifyStmt = db.prepare('SELECT id FROM characters WHERE id = ? AND user_id = ?');
    if (!verifyStmt.get(characterId, userId)) {
      return null;
    }
    
    const transaction = db.transaction(() => {
      for (const tagValue of tagValues) {
        if (tagValue.startsWith('theme:')) {
          // Mark theme as burned
          const themeName = tagValue.replace('theme:', '');
          db.prepare(`
            UPDATE character_themes
            SET is_burned = 1
            WHERE character_id = ? AND name = ?
          `).run(characterId, themeName);
        } else if (tagValue.startsWith('tag:')) {
          // Mark theme tag as burned
          const tagName = tagValue.replace('tag:', '');
          db.prepare(`
            UPDATE character_theme_tags
            SET is_burned = 1
            WHERE theme_id IN (
              SELECT id FROM character_themes WHERE character_id = ?
            ) AND tag = ? AND is_weakness = 0
          `).run(characterId, tagName);
        }
        // Note: backpack: and story: tags are handled separately (deletion)
      }
    });
    
    transaction();
    
    // Get updated character
    const updatedCharacter = this.getCharacter(guildId, userId, characterId);
    
    // Auto-sync if enabled (store promise so handlers can await it if needed)
    if (updatedCharacter && updatedCharacter.auto_sync === 1) {
      updatedCharacter._autoSyncPromise = this.autoSyncToSheet(guildId, userId, characterId, updatedCharacter);
    }
    
    return updatedCharacter;
  }

  /**
   * Refresh (unburn) themes/tags based on tagValue strings
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID
   * @param {string[]} tagValues - Array of tagValue strings to refresh
   * @returns {Object|null} Updated character or null if not found
   */
  static refreshBurnedTags(guildId, userId, characterId, tagValues) {
    const db = getDbForGuild(guildId);
    // Verify character exists and belongs to user
    const verifyStmt = db.prepare('SELECT id FROM characters WHERE id = ? AND user_id = ?');
    if (!verifyStmt.get(characterId, userId)) {
      return null;
    }
    
    const transaction = db.transaction(() => {
      for (const tagValue of tagValues) {
        if (tagValue.startsWith('theme:')) {
          // Refresh theme
          const themeName = tagValue.replace('theme:', '');
          db.prepare(`
            UPDATE character_themes
            SET is_burned = 0
            WHERE character_id = ? AND name = ?
          `).run(characterId, themeName);
        } else if (tagValue.startsWith('tag:')) {
          // Refresh theme tag
          const tagName = tagValue.replace('tag:', '');
          db.prepare(`
            UPDATE character_theme_tags
            SET is_burned = 0
            WHERE theme_id IN (
              SELECT id FROM character_themes WHERE character_id = ?
            ) AND tag = ? AND is_weakness = 0
          `).run(characterId, tagName);
        }
      }
    });
    
    transaction();
    
    // Get updated character
    const updatedCharacter = this.getCharacter(guildId, userId, characterId);
    
    // Auto-sync if enabled (store promise so handlers can await it if needed)
    if (updatedCharacter && updatedCharacter.auto_sync === 1) {
      updatedCharacter._autoSyncPromise = this.autoSyncToSheet(guildId, userId, characterId, updatedCharacter);
    }
    
    return updatedCharacter;
  }

  /**
   * Create a new character
   * @param {string} userId - Discord user ID
   * @param {string} name - Character name
   * @param {Array} themes - Array of theme objects { name, tags, weaknesses }
   * @returns {Object} The created character
   */
  static createCharacter(guildId, userId, name, themes) {
    const db = getDbForGuild(guildId);
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
        const improvements = theme.improvements !== undefined ? theme.improvements : 0;
        const themeResult = db.prepare(`
          INSERT INTO character_themes (character_id, name, theme_order, is_burned, improvements)
          VALUES (?, ?, ?, ?, ?)
        `).run(characterId, theme.name, index, themeBurned, improvements);
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
    return this.getCharacter(guildId, userId, characterId);
  }

  /**
   * Create an unassigned character (user_id = NULL, auto_sync = 1)
   * @param {string} guildId - Guild ID
   * @param {string} name - Character name
   * @param {Array} themes - Array of theme objects { name, tags, weaknesses }
   * @returns {Object} The created character
   */
  static createUnassignedCharacter(guildId, name, themes) {
    const db = getDbForGuild(guildId);
    const transaction = db.transaction(() => {
      // Insert character with NULL user_id and auto_sync = 1
      const insertChar = db.prepare(`
        INSERT INTO characters (user_id, name, is_active, auto_sync)
        VALUES (?, ?, ?, ?)
      `);
      
      const result = insertChar.run(null, name, 0, 1);
      const characterId = result.lastInsertRowid;
      
      // Insert themes (same as createCharacter)
      const insertTag = db.prepare(`
        INSERT INTO character_theme_tags (theme_id, tag, is_weakness, is_burned)
        VALUES (?, ?, ?, ?)
      `);
      
      themes.forEach((theme, index) => {
        const themeBurned = theme.isBurned ? 1 : 0;
        const improvements = theme.improvements !== undefined ? theme.improvements : 0;
        const themeResult = db.prepare(`
          INSERT INTO character_themes (character_id, name, theme_order, is_burned, improvements)
          VALUES (?, ?, ?, ?, ?)
        `).run(characterId, theme.name, index, themeBurned, improvements);
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
    return this.getCharacterById(guildId, characterId);
  }

  /**
   * Update an unassigned character
   * @param {string} guildId - Guild ID
   * @param {number} characterId - Character ID
   * @param {Object} updates - Updates to apply
   * @returns {Object|null} Updated character or null if not found
   */
  static updateUnassignedCharacter(guildId, characterId, updates) {
    const db = getDbForGuild(guildId);
    // Verify character exists and is unassigned
    const verifyStmt = db.prepare('SELECT id FROM characters WHERE id = ? AND user_id IS NULL');
    if (!verifyStmt.get(characterId)) {
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
      
      // Update backpack if provided
      if (updates.backpack !== undefined) {
        db.prepare('DELETE FROM character_backpack WHERE character_id = ?').run(characterId);
        if (updates.backpack.length > 0) {
          const insertBackpack = db.prepare(`
            INSERT INTO character_backpack (character_id, item)
            VALUES (?, ?)
          `);
          updates.backpack.forEach(item => insertBackpack.run(characterId, item));
        }
      }
      
      // Update story tags if provided
      if (updates.storyTags !== undefined) {
        db.prepare('DELETE FROM character_story_tags WHERE character_id = ?').run(characterId);
        if (updates.storyTags.length > 0) {
          const insertStoryTag = db.prepare(`
            INSERT INTO character_story_tags (character_id, tag)
            VALUES (?, ?)
          `);
          updates.storyTags.forEach(tag => insertStoryTag.run(characterId, tag));
        }
      }
      
      // Update temp statuses if provided
      if (updates.tempStatuses !== undefined) {
        db.prepare('DELETE FROM character_statuses WHERE character_id = ?').run(characterId);
        if (updates.tempStatuses.length > 0) {
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
      }
    });
    
    transaction();
    return this.getCharacterById(guildId, characterId);
  }

  /**
   * Claim an unassigned character (assign it to a user and disable auto_sync)
   * @param {string} guildId - Guild ID
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID
   * @returns {Object|null} The claimed character or null if not found/not unassigned
   */
  static claimCharacter(guildId, userId, characterId) {
    const db = getDbForGuild(guildId);
    
    // Verify character exists and is unassigned
    const verifyStmt = db.prepare('SELECT id FROM characters WHERE id = ? AND user_id IS NULL');
    if (!verifyStmt.get(characterId)) {
      return null;
    }
    
    // Check character limit (max 3 characters per user)
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM characters WHERE user_id = ?');
    const existingCount = countStmt.get(userId).count;
    if (existingCount >= 3) {
      return null; // Character limit reached
    }
    
    // Update character: set user_id, disable auto_sync, auto-activate if first character
    const isFirst = existingCount === 0;
    const updateStmt = db.prepare(`
      UPDATE characters
      SET user_id = ?, is_active = ?, auto_sync = 0, updated_at = strftime('%s', 'now')
      WHERE id = ?
    `);
    updateStmt.run(userId, isFirst ? 1 : 0, characterId);
    
    return this.getCharacter(guildId, userId, characterId);
  }

  /**
   * Update a character
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID
   * @param {Object} updates - Updates to apply
   * @returns {Object|null} Updated character or null if not found
   */
  static updateCharacter(guildId, userId, characterId, updates) {
    const db = getDbForGuild(guildId);
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
          INSERT INTO character_themes (character_id, name, theme_order, is_burned, improvements)
          VALUES (?, ?, ?, ?, ?)
        `);
        
        const insertTag = db.prepare(`
          INSERT INTO character_theme_tags (theme_id, tag, is_weakness, is_burned)
          VALUES (?, ?, ?, ?)
        `);
        
        updates.themes.forEach((theme, index) => {
          const themeBurned = theme.isBurned ? 1 : 0;
          const improvements = theme.improvements !== undefined ? theme.improvements : 0;
          const themeResult = db.prepare(`
            INSERT INTO character_themes (character_id, name, theme_order, is_burned, improvements)
            VALUES (?, ?, ?, ?, ?)
          `).run(characterId, theme.name, index, themeBurned, improvements);
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
      
      // Update auto_sync if provided
      if (updates.autoSync !== undefined) {
        db.prepare(`
          UPDATE characters
          SET auto_sync = ?, updated_at = strftime('%s', 'now')
          WHERE id = ?
        `).run(updates.autoSync ? 1 : 0, characterId);
      }
    });
    
    transaction();
    
    // Get updated character
    const updatedCharacter = this.getCharacter(guildId, userId, characterId);
    
    // Check if auto-sync is enabled and sync if needed (but not if we're just toggling autoSync or syncing from sheet)
    // Only sync if autoSync wasn't in the updates (to avoid syncing when enabling/disabling)
    // and skipAutoSync flag is not set (to avoid syncing when syncing FROM sheet)
    if (updatedCharacter && updatedCharacter.auto_sync === 1 && updates.autoSync === undefined && !updates.skipAutoSync) {
      // Auto-sync is enabled and we made changes (not just toggling autoSync or syncing from sheet)
      // Store sync promise on character object so handlers can await it if needed
      updatedCharacter._autoSyncPromise = this.autoSyncToSheet(guildId, userId, characterId, updatedCharacter);
    }
    
    return updatedCharacter;
  }

  /**
   * Get auto-sync note for confirmation messages (if auto-sync occurred)
   * @param {Object} character - Character object (may have _autoSyncPromise)
   * @returns {Promise<string|null>} Sync note or null if no auto-sync
   */
  static async getAutoSyncNote(character) {
    if (!character || character.auto_sync !== 1) {
      return null;
    }

    // Wait for auto-sync to complete if it's running
    if (character._autoSyncPromise) {
      const syncResult = await character._autoSyncPromise;
      if (syncResult && syncResult.success) {
        return `\n\n📤 Auto-synced to Google Sheet.`;
      } else if (syncResult && !syncResult.success) {
        return `\n\n⚠️ Auto-sync failed: ${syncResult.message}`;
      }
    }

    return null;
  }

  /**
   * Delete a character (marks as unassigned instead of deleting)
   * @param {string} guildId - Guild ID
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID
   * @returns {boolean} True if marked as unassigned, false if not found
   */
  static deleteCharacter(guildId, userId, characterId) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      UPDATE characters
      SET user_id = NULL, is_active = 0, auto_sync = 1, updated_at = strftime('%s', 'now')
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
  static setSheetUrl(guildId, userId, characterId, sheetUrl) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      UPDATE characters
      SET google_sheet_url = ?, updated_at = strftime('%s', 'now')
      WHERE id = ? AND user_id = ?
    `);
    
    const result = stmt.run(sheetUrl, characterId, userId);
    return result.changes > 0;
  }

  /**
   * Set Google Sheet URL for an unassigned character
   * @param {string} guildId - Guild ID
   * @param {number} characterId - Character ID
   * @param {string} sheetUrl - Google Sheets URL
   * @returns {boolean} True if updated, false if not found
   */
  static setSheetUrlForUnassigned(guildId, characterId, sheetUrl) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      UPDATE characters
      SET google_sheet_url = ?, updated_at = strftime('%s', 'now')
      WHERE id = ? AND user_id IS NULL
    `);
    
    const result = stmt.run(sheetUrl, characterId);
    return result.changes > 0;
  }

  /**
   * Get Google Sheet URL for a character
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID
   * @returns {string|null} Sheet URL or null if not set
   */
  static getSheetUrl(guildId, userId, characterId) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      SELECT google_sheet_url
      FROM characters
      WHERE id = ? AND user_id = ?
    `);
    
    const result = stmt.get(characterId, userId);
    return result?.google_sheet_url || null;
  }

  /**
   * Check if a Google Sheet URL is already in use by any character
   * Normalizes URLs by extracting the spreadsheet ID to handle variations
   * (different gid parameters, edit vs view, trailing slashes, etc.)
   * @param {string} sheetUrl - Google Sheets URL to check
   * @returns {Object|null} Character object using this URL, or null if not in use
   */
  static getCharacterBySheetUrl(guildId, sheetUrl) {
    const db = getDbForGuild(guildId);
    // Extract spreadsheet ID from the URL
    
    const parsedUrl = new URL(sheetUrl);
    
    const whereClauses = ['google_sheet_url = ?'];
    const params = [`%${parsedUrl.href}%`];
    
    const stmt = db.prepare(`
      SELECT id, user_id, name, google_sheet_url
      FROM characters
      WHERE ${whereClauses.join('\n        AND ')}
      LIMIT 1
    `);
    
    return stmt.get(...params) || null;
  }

  /**
   * Auto-sync character data to Google Sheet (internal helper, never throws)
   * @param {string} guildId - Guild ID
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID
   * @param {Object} character - Character object to sync
   * @returns {Promise<Object|null>} Result with success status and message, or null if sync not needed
   */
  static async autoSyncToSheet(guildId, userId, characterId, character) {
    // Check if auto-sync is enabled
    if (!character || character.auto_sync !== 1) {
      return null;
    }

    // Check if sheet URL is set
    if (!character.google_sheet_url) {
      return null;
    }

    // Check if sheets service is ready
    if (!sheetsService.isReady()) {
      return null;
    }

    try {
      // Write to sheet
      await sheetsService.writeCharacterToSheet(character.google_sheet_url, character);
      return { success: true, message: 'Auto-synced to Google Sheet' };
    } catch (error) {
      console.error('Error auto-syncing to sheet:', error);
      return { success: false, message: `Auto-sync failed: ${error.message}` };
    }
  }

  /**
   * Sync character data TO Google Sheet
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID
   * @returns {Promise<Object>} Result with success status and message
   */
  static async syncToSheet(guildId, userId, characterId) {
    try {
      // Get character
      const character = this.getCharacter(guildId, userId, characterId);
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
  static async syncFromSheet(guildId, userId, characterId) {
    try {
      // Get character to get sheet URL
      const character = this.getCharacter(guildId, userId, characterId);
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
        const fellowship = FellowshipStorage.getFellowshipByName(guildId, sheetData.fellowshipName);
        if (fellowship) {
          fellowshipId = fellowship.id;
        } else {
          console.warn(`Fellowship "${sheetData.fellowshipName}" not found in database. Character will not be assigned to a fellowship.`);
        }
      }

      // Get current character to preserve improvements if bot has >3 and sheet shows 3
      const currentCharacter = this.getCharacter(guildId, userId, characterId);
      const currentThemeImprovements = new Map();
      if (currentCharacter && currentCharacter.themes) {
        currentCharacter.themes.forEach((theme, index) => {
          if (theme.improvements !== undefined) {
            currentThemeImprovements.set(index, theme.improvements);
          }
        });
      }

      // Use burned status from the sheet (sheet is source of truth)
      // The sheet data already includes burned status from readCharacterFromSheet
      // No need to preserve database burned status - sheet takes precedence
      const themesWithBurnedStatus = sheetData.themes.map((theme, index) => {
        // Handle improvements: if bot has >3 and sheet shows 3, keep bot's count
        let improvements = theme.improvements || 0;
        const currentImprovements = currentThemeImprovements.get(index);
        if (currentImprovements !== undefined && currentImprovements > 3 && improvements === 3) {
          // Bot has more than 3, sheet only shows 3 - keep bot's count
          improvements = currentImprovements;
        }
        
        return {
          ...theme,
          improvements: improvements,
          // Theme burned status comes from sheet
          isBurned: theme.isBurned || false,
          // Tags burned status comes from sheet
          tags: theme.tags ? theme.tags.map(tag => {
            const tagText = typeof tag === 'string' ? tag : (tag.tag || tag);
            const isBurned = typeof tag === 'object' ? (tag.isBurned || false) : false;
            return typeof tag === 'object' ? {
              ...tag,
              isBurned: isBurned
            } : {
              tag: tagText,
              isBurned: isBurned
            };
          }) : [],
          // Weaknesses burned status comes from sheet
          weaknesses: theme.weaknesses ? theme.weaknesses.map(weakness => {
            const weaknessText = typeof weakness === 'string' ? weakness : (weakness.tag || weakness);
            const isBurned = typeof weakness === 'object' ? (weakness.isBurned || false) : false;
            return typeof weakness === 'object' ? {
              ...weakness,
              isBurned: isBurned
            } : {
              tag: weaknessText,
              isBurned: isBurned
            };
          }) : []
        };
      });

      // Update character in database
      // Set skipAutoSync flag to prevent triggering auto-sync when syncing FROM sheet
      const updates = {
        name: sheetData.name,
        themes: themesWithBurnedStatus,
        backpack: sheetData.backpack,
        storyTags: sheetData.storyTags,
        tempStatuses: sheetData.tempStatuses,
        skipAutoSync: true, // Prevent auto-sync when syncing from sheet
      };

      const updatedCharacter = this.updateCharacter(guildId, userId, characterId, updates);
      
      // Set fellowship if found
      if (fellowshipId !== null) {
        this.setFellowship(guildId, userId, characterId, fellowshipId);
      } else if (updatedCharacter && updatedCharacter.fellowship_id) {
        // If no fellowship name in sheet but character has one, remove it
        this.setFellowship(guildId, userId, characterId, null);
      }

      return { success: true, message: 'Character successfully synced from Google Sheet!' };
    } catch (error) {
      console.error('Error syncing from sheet:', error);
      return { success: false, message: `Failed to sync: ${error.message}` };
    }
  }

  /**
   * Increment improvements for themes based on weakness tags used in a roll
   * @param {string} guildId - Guild ID
   * @param {Set<TagEntity>} hinderTags - Set of hinder tags (may include weaknesses)
   * @returns {Object} { improvedThemes: Array<{characterId: number, themeId: number, themeName: string, improvements: number}>, readyToDevelop: Array<{characterId: number, themeId: number, themeName: string, improvements: number}> }
   */
  static incrementThemeImprovements(guildId, hinderTags) {
    const db = getDbForGuild(guildId);
    const improvedThemes = [];
    const readyToDevelop = [];
    
    // Track improvements per character and theme
    // Each weakness tag used in the roll gives one improvement to its theme
    // Map structure: characterId -> themeId -> count
    const characterThemeImprovements = new Map();
    
    // Find all weakness tags in hinderTags and get their theme_ids and character_ids
    for (const tagEntity of hinderTags) {
      // Check if this is a weakness tag
      if (tagEntity.parentType === RollTagParentType.CHARACTER_THEME_TAG) {
        // Get the theme_id and character_id for this weakness tag
        // The database query is the source of truth for character_id
        const stmt = db.prepare(`
          SELECT ctt.theme_id, ctt.tag, ctt.is_weakness, ct.character_id
          FROM character_theme_tags ctt
          JOIN character_themes ct ON ctt.theme_id = ct.id
          WHERE ctt.id = ?
        `);
        const tagData = stmt.get(tagEntity.parentId);
        
        if (tagData && tagData.is_weakness === 1) {
          // This is a weakness, use character_id from database (source of truth)
          const characterId = tagData.character_id;
          
          if (!characterId) {
            continue; // Skip if we can't determine the character
          }
          
          const themeId = tagData.theme_id;
          
          // Initialize maps if needed
          if (!characterThemeImprovements.has(characterId)) {
            characterThemeImprovements.set(characterId, new Map());
          }
          const themeMap = characterThemeImprovements.get(characterId);
          
          if (!themeMap.has(themeId)) {
            themeMap.set(themeId, 0);
          }
          themeMap.set(themeId, themeMap.get(themeId) + 1);
        }
      }
    }
    
    // Update database and collect results
    for (const [characterId, themeMap] of characterThemeImprovements.entries()) {
      for (const [themeId, increment] of themeMap.entries()) {
        // Get current improvements and theme name
        const themeStmt = db.prepare(`
          SELECT name, improvements
          FROM character_themes
          WHERE id = ? AND character_id = ?
        `);
        const theme = themeStmt.get(themeId, characterId);
        
        if (theme) {
          const newImprovements = (theme.improvements || 0) + increment;
          
          // Update improvements
          const updateStmt = db.prepare(`
            UPDATE character_themes
            SET improvements = ?
            WHERE id = ?
          `);
          updateStmt.run(newImprovements, themeId);
          
          improvedThemes.push({
            characterId: characterId,
            themeId: themeId,
            themeName: theme.name,
            improvements: newImprovements
          });
          
          // Check if ready to develop (>= 3)
          if (newImprovements >= 3) {
            readyToDevelop.push({
              characterId: characterId,
              themeId: themeId,
              themeName: theme.name,
              improvements: newImprovements
            });
          }
        }
      }
    }
    
    return { improvedThemes, readyToDevelop };
  }
}
