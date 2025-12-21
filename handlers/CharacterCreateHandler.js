import sheetsService from '../utils/GoogleSheetsService.js';
import sheetTabCache from '../utils/SheetTabCache.js';
import { getBlacklistedGids } from '../utils/SheetTabBlacklist.js';
import { getServerEnv } from '../utils/ServerConfig.js';
import { requireGuildId } from '../utils/GuildUtils.js';

/**
 * Handle autocomplete for char-create command
 * Scans FELLOWSHIP_SHEET_URL for tabs and returns them as autocomplete options
 */
export async function handleCharacterCreateAutocomplete(interaction) {
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
    // Get blacklisted gids (server-specific)
    const blacklistGids = getBlacklistedGids(guildId);

    // Get tabs using cache
    const tabs = await sheetTabCache.getTabs(async () => {
      return await sheetsService.getAllTabs(parsed.spreadsheetId);
    });

    // Filter out blacklisted tabs, then filter by focused value (case-insensitive search on tab title)
    const filtered = tabs
      .filter(tab => !blacklistGids.has(tab.gid)) // Exclude blacklisted gids
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
    console.error('Error in character create autocomplete:', error);
    await interaction.respond([]);
  }
}

