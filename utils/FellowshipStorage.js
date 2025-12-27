import { getDbForGuild } from './Database.js';
import sheetsService from './GoogleSheetsService.js';

/**
 * Storage utility for managing fellowships
 */
export class FellowshipStorage {
  /**
   * Get all fellowships
   * @returns {Array} Array of fellowship objects
   */
  static getAllFellowships(guildId) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      SELECT id, name, created_at, updated_at
      FROM fellowships
      ORDER BY name
    `);
    
    const fellowships = stmt.all();
    
    // Load related data for each fellowship
    return fellowships.map(fellowship => this.loadFellowshipRelations(guildId, fellowship));
  }

  /**
   * Get a fellowship by ID
   * @param {number} fellowshipId - Fellowship ID
   * @returns {Object|null} Fellowship object or null if not found
   */
  static getFellowship(guildId, fellowshipId) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      SELECT id, name, created_at, updated_at
      FROM fellowships
      WHERE id = ?
    `);
    
    const fellowship = stmt.get(fellowshipId);
    return fellowship ? this.loadFellowshipRelations(guildId, fellowship) : null;
  }

  /**
   * Get a fellowship by name
   * @param {string} name - Fellowship name
   * @returns {Object|null} Fellowship object or null if not found
   */
  static getFellowshipByName(guildId, name) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      SELECT id, name, created_at, updated_at
      FROM fellowships
      WHERE name = ?
    `);
    
    const fellowship = stmt.get(name);
    return fellowship ? this.loadFellowshipRelations(guildId, fellowship) : null;
  }

  /**
   * Load all related data for a fellowship
   * @param {Object} fellowship - Base fellowship object
   * @returns {Object} Fellowship with all related data
   */
  static loadFellowshipRelations(guildId, fellowship) {
    const db = getDbForGuild(guildId);
    // Load tags and weaknesses (include IDs)
    const tagsStmt = db.prepare(`
      SELECT id, tag, is_weakness
      FROM fellowship_tags
      WHERE fellowship_id = ?
    `);
    
    const allTags = tagsStmt.all(fellowship.id);
    
    fellowship.tags = allTags.filter(t => !t.is_weakness).map(t => ({ id: t.id, tag: t.tag }));
    fellowship.weaknesses = allTags.filter(t => t.is_weakness).map(t => ({ id: t.id, tag: t.tag }));
    
    return fellowship;
  }

  /**
   * Get tag data by entity ID for roll display/calculation
   * @param {string} guildId - Guild ID
   * @param {number} tagId - Fellowship tag ID
   * @returns {Object|null} { name: string, type: 'tag'|'weakness', isWeakness: boolean, characterId: null } or null
   */
  static getTagDataByEntity(guildId, tagId) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare('SELECT tag, is_weakness FROM fellowship_tags WHERE id = ?');
    const result = stmt.get(tagId);
    if (!result) return null;
    return {
      name: result.tag,
      type: result.is_weakness === 1 ? 'weakness' : 'tag',
      isWeakness: result.is_weakness === 1,
      characterId: null // Fellowship tags don't belong to any character
    };
  }

  /**
   * Create or update a fellowship
   * @param {string} name - Fellowship name
   * @param {Array} tags - Array of tag strings
   * @param {Array} weaknesses - Array of weakness strings
   * @returns {Object} The created or updated fellowship
   */
  static upsertFellowship(guildId, name, tags = [], weaknesses = []) {
    const db = getDbForGuild(guildId);
    const transaction = db.transaction(() => {
      // Check if fellowship exists
      const existingStmt = db.prepare('SELECT id FROM fellowships WHERE name = ?');
      const existing = existingStmt.get(name);
      
      let fellowshipId;
      
      if (existing) {
        // Update existing fellowship
        fellowshipId = existing.id;
        db.prepare(`
          UPDATE fellowships
          SET updated_at = strftime('%s', 'now')
          WHERE id = ?
        `).run(fellowshipId);
      } else {
        // Create new fellowship
        const result = db.prepare(`
          INSERT INTO fellowships (name)
          VALUES (?)
        `).run(name);
        fellowshipId = result.lastInsertRowid;
      }
      
      // Delete existing tags and weaknesses
      db.prepare('DELETE FROM fellowship_tags WHERE fellowship_id = ?').run(fellowshipId);
      
      // Insert new tags
      const insertTag = db.prepare(`
        INSERT INTO fellowship_tags (fellowship_id, tag, is_weakness)
        VALUES (?, ?, ?)
      `);
      
      tags.forEach(tag => {
        insertTag.run(fellowshipId, tag, 0);
      });
      
      weaknesses.forEach(weakness => {
        insertTag.run(fellowshipId, weakness, 1);
      });
      
      return fellowshipId;
    });
    
    const fellowshipId = transaction();
    return this.getFellowship(fellowshipId);
  }

  /**
   * Delete a fellowship
   * @param {number} fellowshipId - Fellowship ID
   * @returns {boolean} True if deleted, false if not found
   */
  static deleteFellowship(guildId, fellowshipId) {
    const db = getDbForGuild(guildId);
    const stmt = db.prepare(`
      DELETE FROM fellowships
      WHERE id = ?
    `);
    
    const result = stmt.run(fellowshipId);
    return result.changes > 0;
  }

  /**
   * Sync fellowship data FROM Google Sheet
   * @param {string} sheetUrl - Google Sheets URL
   * @returns {Promise<Object>} Result with success status and message
   */
  static async syncFromSheet(sheetUrl) {
    try {
      // Check if sheets service is ready
      if (!sheetsService.isReady()) {
        return { success: false, message: 'Google Sheets service not initialized. Check GOOGLE_SHEETS_SETUP.md for setup instructions.' };
      }

      // Read from sheet
      const fellowshipData = await sheetsService.readFellowshipFromSheet(sheetUrl);

      // Upsert fellowship
      const fellowship = this.upsertFellowship(
        fellowshipData.name,
        fellowshipData.tags,
        fellowshipData.weaknesses
      );

      return { 
        success: true, 
        message: `Fellowship "${fellowship.name}" successfully synced from Google Sheet!`,
        fellowship 
      };
    } catch (error) {
      console.error('Error syncing fellowship from sheet:', error);
      return { success: false, message: `Failed to sync: ${error.message}` };
    }
  }
}

