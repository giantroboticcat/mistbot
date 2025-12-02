import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const STORAGE_FILE = join(process.cwd(), 'data', 'characters.json');

/**
 * Storage utility for managing characters per user
 */
export class CharacterStorage {
  /**
   * Load character data from storage file
   * @returns {Object} Map of userId -> { characters: [{ id, name, themes, backpack, storyTags, tempStatuses }] }
   */
  static load() {
    if (!existsSync(STORAGE_FILE)) {
      return {};
    }

    try {
      const data = readFileSync(STORAGE_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading character data:', error);
      return {};
    }
  }

  /**
   * Save character data to storage file
   * @param {Object} data - Map of userId -> { characters: [...] }
   */
  static save(data) {
    // Ensure data directory exists
    const dataDir = join(process.cwd(), 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    try {
      writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving character data:', error);
      throw error;
    }
  }

  /**
   * Get user's characters, ensuring the user exists
   * @param {string} userId - Discord user ID
   * @returns {Array} Array of character objects
   */
  static getUserCharacters(userId) {
    const data = this.load();
    if (!data[userId]) {
      data[userId] = { characters: [], activeCharacterId: null };
    }
    return data[userId].characters || [];
  }

  /**
   * Get the active character ID for a user
   * @param {string} userId - Discord user ID
   * @returns {number|null} The active character ID or null if none
   */
  static getActiveCharacterId(userId) {
    const data = this.load();
    if (!data[userId]) {
      return null;
    }
    return data[userId].activeCharacterId || null;
  }

  /**
   * Set the active character for a user
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID to set as active
   * @returns {boolean} True if set successfully, false if character not found
   */
  static setActiveCharacter(userId, characterId) {
    const data = this.load();
    if (!data[userId]) {
      data[userId] = { characters: [], activeCharacterId: null };
    }

    // Verify the character exists for this user
    const character = this.getCharacter(userId, characterId);
    if (!character) {
      return false;
    }

    data[userId].activeCharacterId = characterId;
    this.save(data);
    return true;
  }

  /**
   * Get the active character for a user
   * @param {string} userId - Discord user ID
   * @returns {Object|null} The active character or null if none
   */
  static getActiveCharacter(userId) {
    const activeCharacterId = this.getActiveCharacterId(userId);
    if (!activeCharacterId) {
      return null;
    }
    return this.getCharacter(userId, activeCharacterId);
  }

  /**
   * Create a new character for a user
   * @param {string} userId - Discord user ID
   * @param {string} name - Character name
   * @param {Array} themes - Array of theme objects [{ name: string, tags: [], weaknesses: [] }, ...]
   * @returns {Object} The created character
   */
  static createCharacter(userId, name, themes) {
    const data = this.load();
    if (!data[userId]) {
      data[userId] = { characters: [] };
    }

    // Generate a unique ID for the character
    const existingIds = data[userId].characters.map(c => c.id || 0);
    const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;

    const character = {
      id: newId,
      name: name.trim(),
      themes: themes.map(theme => ({
        name: theme.name || '',
        tags: theme.tags || [],
        weaknesses: theme.weaknesses || [],
      })),
      backpack: [],
      storyTags: [],
      tempStatuses: [],
      burnedTags: [], // Array of tag identifiers (e.g., "theme:name", "tag:tagName", "backpack:item", "story:tag")
      createdAt: new Date().toISOString(),
    };

    data[userId].characters.push(character);
    // Set the newly created character as the active character
    data[userId].activeCharacterId = newId;
    this.save(data);
    return character;
  }

  /**
   * Get a character by ID for a user
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID
   * @returns {Object|null} The character or null if not found
   */
  static getCharacter(userId, characterId) {
    const characters = this.getUserCharacters(userId);
    return characters.find(c => c.id === characterId) || null;
  }

  /**
   * Update a character
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID
   * @param {Object} updates - Partial character object with fields to update
   * @returns {Object|null} The updated character or null if not found
   */
  static updateCharacter(userId, characterId, updates) {
    const data = this.load();
    if (!data[userId]) {
      return null;
    }

    const characterIndex = data[userId].characters.findIndex(c => c.id === characterId);
    if (characterIndex === -1) {
      return null;
    }

    data[userId].characters[characterIndex] = {
      ...data[userId].characters[characterIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.save(data);
    return data[userId].characters[characterIndex];
  }

  /**
   * Delete a character
   * @param {string} userId - Discord user ID
   * @param {number} characterId - Character ID
   * @returns {boolean} True if deleted, false if not found
   */
  static deleteCharacter(userId, characterId) {
    const data = this.load();
    if (!data[userId]) {
      return false;
    }

    const initialLength = data[userId].characters.length;
    data[userId].characters = data[userId].characters.filter(c => c.id !== characterId);

    if (data[userId].characters.length < initialLength) {
      this.save(data);
      return true;
    }

    return false;
  }
}

