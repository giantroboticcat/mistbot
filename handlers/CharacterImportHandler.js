import sheetsService from '../utils/GoogleSheetsService.js';
import sheetTabCache from '../utils/SheetTabCache.js';
import { getBlacklistedGids } from '../utils/SheetTabBlacklist.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { getServerEnv } from '../utils/ServerConfig.js';
import { requireGuildId } from '../utils/GuildUtils.js';

/**
 * Handle autocomplete for char-import command
 * Scans FELLOWSHIP_SHEET_URL for tabs and filters out those already imported
 */
export async function handleCharacterImportAutocomplete(interaction) {
  const guildId = requireGuildId(interaction);
  const focusedValue = interaction.options.getFocused().toLowerCase();

  // Get FELLOWSHIP_SHEET_URL from environment (server-specific)
  const fellowshipSheetUrl = getServerEnv('FELLOWSHIP_SHEET_URL', guildId);
  if (!fellowshipSheetUrl) {
    await interaction.respond([]);
    return;
  }

  // Check if sheets service is ready
  if (!sheetsService.isReady()) {
    await interaction.respond([]);
    return;
  }

  // Parse the fellowship sheet URL to get spreadsheet ID
  const parsed = sheetsService.parseSpreadsheetUrl(fellowshipSheetUrl);
  if (!parsed) {
    await interaction.respond([]);
    return;
  }

  try {
    // Get all existing characters to check which tabs are already imported
    const allCharacters = CharacterStorage.getAllCharacters(guildId);
    
    // Create a set of gids that are already imported
    // Extract gid from google_sheet_url (format: .../edit#gid=123456 or .../edit?gid=123456 or .../edit&gid=123456)
    const importedGids = new Set();
    allCharacters.forEach(char => {
      if (char.google_sheet_url) {
        try {
          const url = new URL(char.google_sheet_url);
          // Check for gid in hash (#gid=) - most common format
          // url.hash is like "#gid=123456", so we match "gid=(\d+)"
          const hashMatch = url.hash.match(/gid=(\d+)/);
          if (hashMatch) {
            importedGids.add(hashMatch[1]);
          } else {
            // Check query params as fallback
            const queryGid = url.searchParams.get('gid');
            if (queryGid) {
              importedGids.add(queryGid);
            }
          }
        } catch (error) {
          // Skip invalid URLs
          console.warn(`Invalid google_sheet_url for character ${char.id}: ${char.google_sheet_url}`);
        }
      }
    });

    // Get blacklisted gids (server-specific)
    const blacklistGids = getBlacklistedGids(guildId);

    // Get tabs using cache
    const tabs = await sheetTabCache.getTabs(async () => {
      return await sheetsService.getAllTabs(parsed.spreadsheetId);
    });

    // Filter out:
    // 1. Blacklisted tabs
    // 2. Already imported tabs (by gid)
    // 3. Filter by focused value (case-insensitive search on tab title)
    const filtered = tabs
      .filter(tab => !blacklistGids.has(tab.gid)) // Exclude blacklisted gids
      .filter(tab => !importedGids.has(tab.gid)) // Exclude already imported tabs
      .filter(tab => tab.title.toLowerCase().includes(focusedValue))
      .slice(0, 25); // Discord autocomplete limit is 25

    // Map to autocomplete choices
    // Value format: "tabTitle|||gid" so we can reconstruct the URL later
    // Using ||| as delimiter since single | is common in tab names
    const choices = filtered.map(tab => ({
      name: tab.title,
      value: `${tab.title}|||${tab.gid}`,
    }));

    await interaction.respond(choices);
  } catch (error) {
    console.error('Error in character import autocomplete:', error);
    await interaction.respond([]);
  }
}

