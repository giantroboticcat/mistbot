import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Command } from './Command.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { FellowshipStorage } from '../utils/FellowshipStorage.js';
import sheetsService from '../utils/GoogleSheetsService.js';
import sheetTabCache from '../utils/SheetTabCache.js';
import { isGidBlacklisted } from '../utils/SheetTabBlacklist.js';
import { getServerEnv } from '../utils/ServerConfig.js';
import { requireGuildId } from '../utils/GuildUtils.js';

/**
 * Import an unassigned character from Google Sheets
 */
export class ImportCharacterCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('char-import')
      .setDescription('Import an unassigned character from Google Sheets (for GMs/narrators)')
      .addStringOption(option =>
        option
          .setName('character')
          .setDescription('Select a character from the fellowship sheet that hasn\'t been imported yet')
          .setRequired(true)
          .setAutocomplete(true));
  }

  async execute(interaction) {
    const characterValue = interaction.options.getString('character', true);
    // The value is in format "tabTitle|||gid" to identify the specific tab
    // Using ||| as delimiter since single | is common in tab names
    const lastDelimiterIndex = characterValue.lastIndexOf('|||');
    
    if (lastDelimiterIndex === -1) {
      await interaction.reply({
        content: '❌ Invalid character selection. Please use autocomplete to select a character.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    
    const tabTitle = characterValue.substring(0, lastDelimiterIndex);
    const gid = characterValue.substring(lastDelimiterIndex + 3); // +3 to skip past "|||"
    
    if (!gid) {
      await interaction.reply({
        content: '❌ Invalid character selection. Please use autocomplete to select a character.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if gid is blacklisted
    const guildId = requireGuildId(interaction);
    if (isGidBlacklisted(guildId, gid)) {
      await interaction.reply({
        content: '❌ This character sheet is not available for selection.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get FELLOWSHIP_SHEET_URL from environment
    const fellowshipSheetUrl = getServerEnv('FELLOWSHIP_SHEET_URL', guildId);
    if (!fellowshipSheetUrl) {
      await interaction.reply({
        content: '❌ FELLOWSHIP_SHEET_URL is not configured. Please contact an administrator.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Parse the fellowship sheet URL to get spreadsheet ID
    const parsed = sheetsService.parseSpreadsheetUrl(fellowshipSheetUrl);
    if (!parsed) {
      await interaction.reply({
        content: '❌ Invalid fellowship sheet URL configuration.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Construct the sheet URL with the selected tab's gid
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${parsed.spreadsheetId}/edit#gid=${gid}`;
    
    // Double-check if this sheet URL is already in use (shouldn't happen if autocomplete worked correctly)
    const existingCharacter = CharacterStorage.getCharacterBySheetUrl(guildId, sheetUrl);
    if (existingCharacter) {
      const ownerInfo = existingCharacter.user_id 
        ? `**Owner:** <@${existingCharacter.user_id}>` 
        : '**Status:** Unassigned (available to claim)';
      await interaction.reply({
        content: `❌ This Google Sheet has already been imported.\n\n**Character:** ${existingCharacter.name}\n${ownerInfo}\n\nEach sheet can only be imported once.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if sheets service is ready
    if (!sheetsService.isReady()) {
      await interaction.reply({
        content: '❌ Google Sheets service not initialized. Check GOOGLE_SHEETS_SETUP.md for setup instructions.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Defer reply since reading from sheet might take a moment
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
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
        } else {
          console.warn(`Fellowship "${characterData.fellowshipName}" not found in database. Character will not be assigned to a fellowship.`);
        }
      }

      await interaction.editReply({
        content: `✅ Unassigned character **${characterData.name}** imported successfully from Google Sheet!\n\nPlayers can claim this character using \`/char-create\`.`,
      });

    } catch (error) {
      console.error('Error importing unassigned character from sheet:', error);
      await interaction.editReply({
        content: `❌ Failed to import character: ${error.message}`,
      });
    }
  }
}

