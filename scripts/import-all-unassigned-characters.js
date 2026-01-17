#!/usr/bin/env node
import { readdirSync } from 'fs';
import { join } from 'path';
import { getDbForGuild } from '../utils/Database.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { FellowshipStorage } from '../utils/FellowshipStorage.js';
import sheetsService from '../utils/GoogleSheetsService.js';
import { getBlacklistedGids } from '../utils/SheetTabBlacklist.js';
import { initializeEnvs, getServerEnv } from '../utils/ServerConfig.js';

// Initialize environment variables (base .env and all guild-specific .env.{guildId} files)
initializeEnvs();

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
        return guildId.length >= 17 && guildId.length <= 19;
      });
    
    return guildIds;
  } catch (error) {
    console.error('❌ Error reading data directory:', error.message);
    return [];
  }
}

/**
 * Extract gid from a Google Sheet URL
 * @param {string} sheetUrl - Google Sheet URL
 * @returns {string|null} The gid, or null if not found
 */
function extractGidFromUrl(sheetUrl) {
  if (!sheetUrl) return null;
  try {
    const url = new URL(sheetUrl);
    // Check for gid in hash (#gid=) - most common format
    const hashMatch = url.hash.match(/gid=(\d+)/);
    if (hashMatch) {
      return hashMatch[1];
    }
    // Check query params as fallback
    const queryGid = url.searchParams.get('gid');
    if (queryGid) {
      return queryGid;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Get all imported gids for a guild
 * @param {string} guildId - Guild ID
 * @returns {Set<string>} Set of imported gids
 */
function getImportedGids(guildId) {
  const allCharacters = CharacterStorage.getAllCharacters(guildId);
  const importedGids = new Set();
  
  allCharacters.forEach(char => {
    if (char.google_sheet_url) {
      const gid = extractGidFromUrl(char.google_sheet_url);
      if (gid) {
        importedGids.add(gid);
      }
    }
  });
  
  return importedGids;
}

/**
 * Import a single character from a sheet tab
 * @param {string} guildId - Guild ID
 * @param {string} tabTitle - Tab title
 * @param {string} gid - Tab GID
 * @param {string} fellowshipSheetUrl - Fellowship sheet URL
 * @returns {Promise<{success: boolean, characterName?: string, error?: string}>}
 */
async function importCharacter(guildId, tabTitle, gid, fellowshipSheetUrl) {
  try {
    // Parse the fellowship sheet URL to get spreadsheet ID
    const parsed = sheetsService.parseSpreadsheetUrl(fellowshipSheetUrl);
    if (!parsed) {
      return { success: false, error: 'Invalid fellowship sheet URL' };
    }

    // Construct the sheet URL with the tab's gid
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${parsed.spreadsheetId}/edit#gid=${gid}`;
    
    // Double-check if this sheet URL is already in use
    const existingCharacter = CharacterStorage.getCharacterBySheetUrl(guildId, sheetUrl);
    if (existingCharacter) {
      return { success: false, error: `Already imported as: ${existingCharacter.name}` };
    }

    // Read character data from sheet
    const characterData = await sheetsService.readCharacterFromSheet(sheetUrl);

    // Create unassigned character (user_id = null, auto_sync = 1)
    const character = CharacterStorage.createUnassignedCharacter(
      guildId,
      characterData.name,
      characterData.themes
    );

    // Update with additional fields
    const updates = {};
    if (characterData.backpack && characterData.backpack.length > 0) {
      updates.backpack = characterData.backpack;
    }
    if (characterData.storyTags && characterData.storyTags.length > 0) {
      updates.storyTags = characterData.storyTags;
    }
    if (characterData.tempStatuses && characterData.tempStatuses.length > 0) {
      updates.tempStatuses = characterData.tempStatuses;
    }

    if (Object.keys(updates).length > 0) {
      CharacterStorage.updateUnassignedCharacter(guildId, character.id, updates);
    }

    // Set the sheet URL
    CharacterStorage.setSheetUrlForUnassigned(guildId, character.id, sheetUrl);

    // Look up and assign fellowship if fellowship name is provided
    if (characterData.fellowshipName) {
      const fellowship = FellowshipStorage.getFellowshipByName(guildId, characterData.fellowshipName);
      if (fellowship) {
        CharacterStorage.setFellowshipForUnassigned(guildId, character.id, fellowship.id);
      }
    }

    return { success: true, characterName: characterData.name };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Main function to import all unassigned characters
 * @param {number} delayMs - Delay between API calls in milliseconds (default: 1500ms)
 */
async function importAllUnassignedCharacters(delayMs = 1500) {
  console.log('📥 Starting bulk import of unassigned characters...\n');

  if (!sheetsService.isReady()) {
    console.error('❌ Google Sheets service not initialized. Check GOOGLE_SHEETS_SETUP.md for setup instructions.');
    process.exit(1);
  }

  const guildIds = getAllGuildIds();
  console.log(`📋 Found ${guildIds.length} guild(s) to process\n`);

  let totalImported = 0;
  let totalFailed = 0;
  const errors = [];

  for (const guildId of guildIds) {
    console.log(`\n📂 Processing guild: ${guildId}`);
    
    // Get FELLOWSHIP_SHEET_URL
    const fellowshipSheetUrl = getServerEnv('FELLOWSHIP_SHEET_URL', guildId);
    if (!fellowshipSheetUrl) {
      console.log(`   ⚠️  FELLOWSHIP_SHEET_URL not configured for this guild. Skipping.`);
      continue;
    }

    // Parse the fellowship sheet URL to get spreadsheet ID
    const parsed = sheetsService.parseSpreadsheetUrl(fellowshipSheetUrl);
    if (!parsed) {
      console.log(`   ⚠️  Invalid fellowship sheet URL. Skipping.`);
      continue;
    }

    // Get all tabs from the fellowship sheet
    console.log(`   📊 Fetching tabs from fellowship sheet...`);
    let tabs;
    try {
      tabs = await sheetsService.getAllTabs(parsed.spreadsheetId);
      console.log(`   📋 Found ${tabs.length} tab(s) in fellowship sheet`);
    } catch (error) {
      console.error(`   ❌ Failed to fetch tabs: ${error.message}`);
      continue;
    }

    // Get blacklisted gids
    const blacklistGids = getBlacklistedGids(guildId);
    console.log(`   🚫 ${blacklistGids.size} blacklisted gid(s)`);

    // Get already imported gids
    const importedGids = getImportedGids(guildId);
    console.log(`   ✅ ${importedGids.size} already imported tab(s)`);

    // Filter tabs: exclude blacklisted and already imported
    const unimportedTabs = tabs.filter(tab => 
      !blacklistGids.has(tab.gid) && !importedGids.has(tab.gid)
    );

    console.log(`   📥 ${unimportedTabs.length} unimported tab(s) to process\n`);

    if (unimportedTabs.length === 0) {
      console.log(`   ✓ No unimported characters found for this guild.`);
      continue;
    }

    // Import each unimported tab
    for (let i = 0; i < unimportedTabs.length; i++) {
      const tab = unimportedTabs[i];
      console.log(`   [${i + 1}/${unimportedTabs.length}] Importing: ${tab.title} (gid: ${tab.gid})...`);
      
      const result = await importCharacter(guildId, tab.title, tab.gid, fellowshipSheetUrl);
      
      if (result.success) {
        totalImported++;
        console.log(`      ✅ Successfully imported: ${result.characterName}`);
      } else {
        totalFailed++;
        const errorMsg = `Failed to import ${tab.title}: ${result.error}`;
        console.error(`      ❌ ${errorMsg}`);
        errors.push({ guildId, tabTitle: tab.title, gid: tab.gid, error: result.error });
      }

      // Add delay between API calls to avoid rate limits (except for the last one)
      if (i < unimportedTabs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Import Summary');
  console.log('='.repeat(60));
  console.log(`✅ Successfully imported: ${totalImported} character(s)`);
  console.log(`❌ Failed imports: ${totalFailed} character(s)`);

  if (errors.length > 0) {
    console.log('\n❌ Errors encountered:');
    errors.forEach(({ guildId, tabTitle, gid, error }) => {
      console.log(`   - ${tabTitle} (Guild: ${guildId}, GID: ${gid}): ${error}`);
    });
  }

  console.log('\n✨ Import process complete!');
}

// Parse command-line arguments
// Usage: node import-all-unassigned-characters.js [delayMs]
// Examples:
//   node import-all-unassigned-characters.js           # Use default 1500ms delay
//   node import-all-unassigned-characters.js 2000      # Use 2000ms delay between calls
const delayMs = process.argv[2] ? parseInt(process.argv[2], 10) : 1500;
if (isNaN(delayMs) || delayMs < 0) {
  console.error('❌ Invalid delay value. Expected a positive number (milliseconds).');
  process.exit(1);
}

// Run the import
importAllUnassignedCharacters(delayMs).catch(error => {
  console.error('❌ Fatal error during import:', error);
  process.exit(1);
});

