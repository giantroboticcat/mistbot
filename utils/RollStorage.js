import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const STORAGE_FILE = join(process.cwd(), 'data', 'rolls.json');

/**
 * Storage utility for managing roll proposals
 */
export class RollStorage {
  /**
   * Load roll data from storage file
   * @returns {Object} Map of rollId -> roll proposal data
   */
  static load() {
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
      console.error('Error loading roll data:', error);
      return {};
    }
  }

  /**
   * Save roll data to storage file
   * @param {Object} data - Map of rollId -> roll proposal data
   */
  static save(data) {
    // Ensure data directory exists
    const dataDir = join(process.cwd(), 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    try {
      // Convert Sets to arrays for JSON serialization
      const serializable = {};
      for (const [rollId, roll] of Object.entries(data)) {
        serializable[rollId] = {
          ...roll,
          helpTags: roll.helpTags ? Array.from(roll.helpTags) : [],
          hinderTags: roll.hinderTags ? Array.from(roll.hinderTags) : [],
          burnedTags: roll.burnedTags ? Array.from(roll.burnedTags) : [],
        };
      }
      writeFileSync(STORAGE_FILE, JSON.stringify(serializable, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving roll data:', error);
      throw error;
    }
  }

  /**
   * Get the next sequential roll ID
   * @returns {number} Next roll ID
   */
  static getNextId() {
    const data = this.load();
    const ids = Object.keys(data).map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (ids.length === 0) {
      return 1;
    }
    return Math.max(...ids) + 1;
  }

  /**
   * Create a new roll proposal
   * @param {Object} rollData - Roll proposal data
   * @returns {number} The roll ID
   */
  static createRoll(rollData) {
    const data = this.load();
    const rollId = this.getNextId();
    
    data[rollId] = {
      ...rollData,
      id: rollId,
      createdAt: new Date().toISOString(),
      status: 'proposed', // proposed, confirmed, executed
    };
    
    this.save(data);
    return rollId;
  }

  /**
   * Get a roll proposal by ID
   * @param {number} rollId - Roll ID
   * @returns {Object|null} Roll proposal data or null if not found
   */
  static getRoll(rollId) {
    const data = this.load();
    const roll = data[rollId];
    if (!roll) {
      return null;
    }
    // Convert arrays back to Sets
    if (roll.helpTags) roll.helpTags = new Set(roll.helpTags);
    if (roll.hinderTags) roll.hinderTags = new Set(roll.hinderTags);
    if (roll.burnedTags) roll.burnedTags = new Set(roll.burnedTags);
    return roll;
  }

  /**
   * Update a roll proposal
   * @param {number} rollId - Roll ID
   * @param {Object} updates - Fields to update
   */
  static updateRoll(rollId, updates) {
    const data = this.load();
    if (!data[rollId]) {
      throw new Error(`Roll ${rollId} not found`);
    }
    
    data[rollId] = {
      ...data[rollId],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    this.save(data);
  }

  /**
   * Delete a roll proposal
   * @param {number} rollId - Roll ID
   */
  static deleteRoll(rollId) {
    const data = this.load();
    delete data[rollId];
    this.save(data);
  }

  /**
   * Get all roll proposals
   * @returns {Array} Array of roll proposals
   */
  static getAllRolls() {
    const data = this.load();
    return Object.values(data).map(roll => {
      if (roll.helpTags) roll.helpTags = new Set(roll.helpTags);
      if (roll.hinderTags) roll.hinderTags = new Set(roll.hinderTags);
      if (roll.burnedTags) roll.burnedTags = new Set(roll.burnedTags);
      return roll;
    });
  }
}

