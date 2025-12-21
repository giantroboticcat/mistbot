import { SlashCommandBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder } from 'discord.js';
import { Command } from './Command.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { FellowshipStorage } from '../utils/FellowshipStorage.js';
import { TagFormatter } from '../utils/TagFormatter.js';
import sheetsService from '../utils/GoogleSheetsService.js';
import sheetTabCache from '../utils/SheetTabCache.js';
import { isGidBlacklisted } from '../utils/SheetTabBlacklist.js';
import { getServerEnv } from '../utils/ServerConfig.js';
import { requireGuildId } from '../utils/GuildUtils.js';

/**
 * Create a new character with themes
 */
export class CreateCharacterCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('char-create')
      .setDescription('Create a new character by importing from Google Sheets')
      .addStringOption(option =>
        option
          .setName('character')
          .setDescription('Select a character from the fellowship sheet')
          .setRequired(true)
          .setAutocomplete(true));
  }

  async execute(interaction) {
    const characterValue = interaction.options.getString('character', true);
    console.log('characterValue', characterValue);
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
    console.log('guildId', guildId);
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
    console.log('sheetUrl', sheetUrl);
    // Import from sheet
    await this.createFromSheet(interaction, sheetUrl);
  }

  /**
   * Create character from Google Sheet
   */
  async createFromSheet(interaction, sheetUrl) {
    const guildId = requireGuildId(interaction);
    const userId = interaction.user.id;

    // Check character limit (max 3 characters per user)
    const existingCharacters = CharacterStorage.getUserCharacters(guildId, userId);
    if (existingCharacters.length >= 3) {
      await interaction.reply({
        content: `❌ You have reached the maximum limit of 3 characters.\n\nTo create a new character, you must first delete one of your existing characters using the character edit screen.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Validate URL format
    const urlPattern = /https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/;
    if (!urlPattern.test(sheetUrl)) {
      await interaction.reply({
        content: '❌ Invalid Google Sheets URL format. Please use a URL like:\n`https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit#gid=123456`',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if this sheet URL is already in use
    const existingCharacter = CharacterStorage.getCharacterBySheetUrl(guildId, sheetUrl);
    if (existingCharacter) {
      await interaction.reply({
        content: `❌ This Google Sheet has already been imported.\n\n**Character:** ${existingCharacter.name}\n**Owner:** <@${existingCharacter.user_id}>\n\nEach sheet can only be imported once. If you need to update an existing character, use the character edit commands.`,
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

      // Create character in database
      const character = CharacterStorage.createCharacter(
        guildId,
        userId,
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
        CharacterStorage.updateCharacter(guildId, userId, character.id, updates);
      }

      // Set the sheet URL
      CharacterStorage.setSheetUrl(guildId, userId, character.id, sheetUrl);

      // Look up and assign fellowship if fellowship name is provided
      if (characterData.fellowshipName) {
        const fellowship = FellowshipStorage.getFellowshipByName(guildId, characterData.fellowshipName);
        if (fellowship) {
          CharacterStorage.setFellowship(guildId, userId, character.id, fellowship.id);
        } else {
          console.warn(`Fellowship "${characterData.fellowshipName}" not found in database. Character will not be assigned to a fellowship.`);
        }
      }

      await interaction.editReply({
        content: `✅ Character **${characterData.name}** created successfully from Google Sheet!`,
      });

    } catch (error) {
      console.error('Error creating character from sheet:', error);
      await interaction.editReply({
        content: `❌ Failed to import character: ${error.message}`,
      });
    }
  }

  /**
   * Show create character modal with optional pre-filled values
   * @param {import('discord.js').Interaction} interaction - The interaction
   * @param {Object} values - Optional pre-filled values { name, theme1, theme2, theme3, theme4 }
   * @param {string} errorMessage - Optional error message to include in title
   */
  static async showCreateModal(interaction, values = {}, errorMessage = null) {
    const modal = new ModalBuilder()
      .setCustomId('create_character_modal')
      .setTitle(errorMessage ? `Create Character - ${errorMessage}` : 'Create Character');

    // Character name input
    const nameInput = new TextInputBuilder()
      .setCustomId('character_name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter your character\'s name')
      .setValue(values.name || '')
      .setRequired(true)
      .setMaxLength(100);

    const nameLabel = new LabelBuilder()
      .setLabel('Character Name')
      .setTextInputComponent(nameInput);

    // Theme inputs (4 themes)
    const themeLabels = [];
    
    for (let i = 1; i <= 4; i++) {
      const themeValue = values[`theme${i}`] || '';
      const themeInput = new TextInputBuilder()
        .setCustomId(`theme_${i}`)
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Theme Name | tag1, tag2 | weakness1, weakness2')
        .setValue(themeValue)
        .setRequired(true)
        .setMaxLength(1000);

      const themeLabel = new LabelBuilder()
        .setLabel(`Theme ${i}`)
        .setTextInputComponent(themeInput);

      themeLabels.push(themeLabel);
    }

    modal.addLabelComponents(nameLabel, ...themeLabels);
    await interaction.showModal(modal);
  }

  /**
   * Parse theme input string into name, tags, and weaknesses
   * Format: "Name | tag1, tag2 | weakness1, weakness2"
   * Order is always: name, tags, weaknesses (separated by |)
   * @param {string} input - The theme input string
   * @returns {{ name: string, tags: string[], weaknesses: string[] }}
   */
  static parseTheme(input) {
    const trimmed = input.trim();
    
    // Split by | to separate name, tags, and weaknesses
    const parts = trimmed.split('|').map(p => p.trim());

    // First part is always the name
    const name = parts[0] || '';

    // Second part is tags (comma-separated)
    const tags = parts[1] 
      ? parts[1].split(',').map(t => t.trim()).filter(t => t.length > 0)
      : [];

    // Third part is weaknesses (comma-separated)
    const weaknesses = parts[2]
      ? parts[2].split(',').map(w => w.trim()).filter(w => w.length > 0)
      : [];

    return { name: name.trim(), tags, weaknesses };
  }
}

