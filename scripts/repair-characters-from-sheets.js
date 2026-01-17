import { readdirSync } from 'fs';
import { join } from 'path';
import { getDbForGuild } from '../utils/Database.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import sheetsService from '../utils/GoogleSheetsService.js';
import { FellowshipStorage } from '../utils/FellowshipStorage.js';
import { initializeEnvs } from '../utils/ServerConfig.js';

// Initialize environment variables (base .env and all guild-specific .env.{guildId} files)
initializeEnvs();

// Suppress migration warnings during script execution
// We're only reading data, not running migrations
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
console.log = function(...args) {
  // Filter out migration warnings
  const message = args.join(' ');
  if (message.includes('Database migrations are pending')) {
    return; // Suppress migration warnings
  }
  originalConsoleLog.apply(console, args);
};
console.warn = function(...args) {
  // Filter out migration warnings
  const message = args.join(' ');
  if (message.includes('Database migrations are pending')) {
    return; // Suppress migration warnings
  }
  originalConsoleWarn.apply(console, args);
};

/**
 * Get all guild IDs from database files in the data directory
 * Only includes guild IDs that match Discord guild ID format (17-19 digits)
 * @returns {string[]} Array of guild IDs
 */
function getAllGuildIds() {
  const dataDir = join(process.cwd(), 'data');
  try {
    const files = readdirSync(dataDir);
    const guildIds = files
      .filter(file => file.endsWith('.db') && file.startsWith('mistbot-'))
      .map(file => {
        // Extract guild ID from filename: mistbot-{guildId}.db
        // Only match Discord guild IDs (17-19 digits) to avoid matching "1", "default", etc.
        const match = file.match(/^mistbot-(\d{17,19})\.db$/);
        return match ? match[1] : null;
      })
      .filter(guildId => {
        // Filter out nulls and ensure it's a valid Discord guild ID (17-19 digits)
        if (!guildId) return false;
        // Discord guild IDs are 17-19 digits, so "1" won't match the regex above
        // But add explicit check just in case
        return guildId.length >= 17 && guildId.length <= 19;
      });
    
    return guildIds;
  } catch (error) {
    console.error('❌ Error reading data directory:', error.message);
    return [];
  }
}

/**
 * Get all characters for a guild (both assigned and unassigned)
 * @param {string} guildId - Guild ID
 * @param {number|null} characterId - Optional character ID to filter by
 * @returns {Array} Array of character objects with id, user_id, name, google_sheet_url
 */
function getAllCharacters(guildId, characterId = null) {
  const db = getDbForGuild(guildId);
  let stmt;
  if (characterId !== null) {
    stmt = db.prepare(`
      SELECT id, user_id, name, google_sheet_url
      FROM characters
      WHERE id = ? AND google_sheet_url IS NOT NULL AND google_sheet_url != ''
    `);
    return stmt.all(characterId);
  } else {
    stmt = db.prepare(`
      SELECT id, user_id, name, google_sheet_url
      FROM characters
      WHERE google_sheet_url IS NOT NULL AND google_sheet_url != ''
    `);
    return stmt.all();
  }
}

/**
 * Sync unassigned character from Google Sheet
 * @param {string} guildId - Guild ID
 * @param {number} characterId - Character ID
 * @param {string} sheetUrl - Google Sheet URL
 * @returns {Promise<Object>} Result with success status and message
 */
async function syncUnassignedCharacterFromSheet(guildId, characterId, sheetUrl) {
  try {
    // Check if sheets service is ready
    if (!sheetsService.isReady()) {
      return { success: false, message: 'Google Sheets service not initialized' };
    }

    // Read from sheet
    const sheetData = await sheetsService.readCharacterFromSheet(sheetUrl);

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
    const currentCharacter = CharacterStorage.getCharacterById(guildId, characterId);
    const currentThemeImprovements = new Map();
    if (currentCharacter && currentCharacter.themes) {
      currentCharacter.themes.forEach((theme, index) => {
        if (theme.improvements !== undefined) {
          currentThemeImprovements.set(index, theme.improvements);
        }
      });
    }

    // Prepare themes with improvements handling
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
        }) : [],
      };
    });

    // Update character with all data from sheet
    const updates = {
      name: sheetData.name,
      themes: themesWithBurnedStatus,
    };

    if (sheetData.backpack && sheetData.backpack.length > 0) {
      updates.backpack = sheetData.backpack;
    }
    if (sheetData.storyTags && sheetData.storyTags.length > 0) {
      updates.storyTags = sheetData.storyTags;
    }
    if (sheetData.tempStatuses && sheetData.tempStatuses.length > 0) {
      updates.tempStatuses = sheetData.tempStatuses;
    }

    // Update the character
    CharacterStorage.updateUnassignedCharacter(guildId, characterId, updates);

    // Set fellowship if found
    if (fellowshipId !== null) {
      CharacterStorage.setFellowshipForUnassigned(guildId, characterId, fellowshipId);
    } else if (sheetData.fellowshipName && currentCharacter && currentCharacter.fellowship_id) {
      // If sheet has no fellowship but character had one, remove it
      CharacterStorage.setFellowshipForUnassigned(guildId, characterId, null);
    }

    return { success: true, message: 'Character successfully synced from Google Sheet!' };
  } catch (error) {
    console.error('Error syncing unassigned character from sheet:', error);
    return { success: false, message: `Failed to sync: ${error.message}` };
  }
}

/**
 * Repair all characters by syncing from their Google Sheets
 * @param {number|null} targetCharacterId - Optional character ID to target (format: guildId:characterId)
 */
async function repairCharacters(targetCharacterId = null) {
  console.log('🔧 Starting character data repair from Google Sheets...\n');

  if (!sheetsService.isReady()) {
    console.error('❌ Google Sheets service not initialized. Check GOOGLE_SHEETS_SETUP.md for setup instructions.');
    process.exit(1);
  }

  let guildIds = getAllGuildIds();
  let targetGuildId = null;
  let targetCharId = null;

  // Parse target character ID if provided (format: guildId:characterId)
  if (targetCharacterId) {
    const parts = targetCharacterId.split(':');
    if (parts.length === 2) {
      targetGuildId = parts[0];
      targetCharId = parseInt(parts[1], 10);
      if (isNaN(targetCharId)) {
        console.error(`❌ Invalid character ID format. Expected "guildId:characterId", got: ${targetCharacterId}`);
        process.exit(1);
      }
      // Only process the target guild
      if (!guildIds.includes(targetGuildId)) {
        console.error(`❌ Guild ID ${targetGuildId} not found in database files.`);
        process.exit(1);
      }
      guildIds = [targetGuildId];
      console.log(`🎯 Targeting specific character: ${targetCharId} in guild ${targetGuildId}\n`);
    } else {
      // Try parsing as just character ID (will search all guilds)
      targetCharId = parseInt(targetCharacterId, 10);
      if (isNaN(targetCharId)) {
        console.error(`❌ Invalid character ID format. Expected "guildId:characterId" or numeric characterId, got: ${targetCharacterId}`);
        console.error(`   If providing just characterId, the script will search all guilds.`);
        process.exit(1);
      }
      console.log(`🎯 Targeting character ID: ${targetCharId} (searching all guilds)\n`);
    }
  }

  console.log(`📋 Found ${guildIds.length} guild(s) to process\n`);

  let totalCharacters = 0;
  let successfulRepairs = 0;
  let failedRepairs = 0;
  const errors = [];

  for (const guildId of guildIds) {
    console.log(`\n📂 Processing guild: ${guildId}`);
    const characters = getAllCharacters(guildId, targetCharId);
    
    if (targetCharId && characters.length === 0) {
      console.log(`   ⚠️  Character ID ${targetCharId} not found in this guild or has no Google Sheet URL`);
      continue;
    }
    
    console.log(`   Found ${characters.length} character(s) with Google Sheet URLs`);

    for (const character of characters) {
      totalCharacters++;
      console.log(`\n   🔄 Repairing character: ${character.name} (ID: ${character.id})`);
      
      try {
        let result;
        if (character.user_id) {
          // Assigned character - use syncFromSheet
          result = await CharacterStorage.syncFromSheet(guildId, character.user_id, character.id);
        } else {
          // Unassigned character - use custom sync
          result = await syncUnassignedCharacterFromSheet(guildId, character.id, character.google_sheet_url);
        }

        if (result.success) {
          successfulRepairs++;
          console.log(`   ✅ Successfully repaired: ${character.name}`);
        } else {
          failedRepairs++;
          const errorMsg = `Failed to repair ${character.name} (ID: ${character.id}): ${result.message}`;
          console.error(`   ❌ ${errorMsg}`);
          errors.push({ guildId, characterId: character.id, characterName: character.name, error: result.message });
        }
      } catch (error) {
        failedRepairs++;
        const errorMsg = `Error repairing ${character.name} (ID: ${character.id}): ${error.message}`;
        console.error(`   ❌ ${errorMsg}`);
        errors.push({ guildId, characterId: character.id, characterName: character.name, error: error.message });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Repair Summary');
  console.log('='.repeat(60));
  console.log(`Total characters processed: ${totalCharacters}`);
  console.log(`✅ Successfully repaired: ${successfulRepairs}`);
  console.log(`❌ Failed repairs: ${failedRepairs}`);

  if (errors.length > 0) {
    console.log('\n❌ Errors encountered:');
    errors.forEach(({ guildId, characterId, characterName, error }) => {
      console.log(`   - ${characterName} (ID: ${characterId}, Guild: ${guildId}): ${error}`);
    });
  }

  console.log('\n✨ Repair process complete!');
}

// Parse command-line arguments
// Usage: node repair-characters-from-sheets.js [guildId:characterId]
// Examples:
//   node repair-characters-from-sheets.js                    # Repair all characters
//   node repair-characters-from-sheets.js 123456789:42       # Repair character 42 in guild 123456789
//   node repair-characters-from-sheets.js 42                  # Search for character 42 in all guilds
const targetCharacterId = process.argv[2] || null;

// Run the repair
repairCharacters(targetCharacterId).catch(error => {
  console.error('❌ Fatal error during repair:', error);
  process.exit(1);
});

