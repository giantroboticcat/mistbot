import { SlashCommandBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder } from 'discord.js';
import { Command } from './Command.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { TagFormatter } from '../utils/TagFormatter.js';
import sheetsService from '../utils/GoogleSheetsService.js';

/**
 * Create a new character with themes
 */
export class CreateCharacterCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('char-create')
      .setDescription('Create a new character with 4 themes')
      .addStringOption(option =>
        option
          .setName('sheet-url')
          .setDescription('Optional: Google Sheets URL to import character from')
          .setRequired(false));
  }

  async execute(interaction) {
    const sheetUrl = interaction.options.getString('sheet-url');
    
    // If sheet URL provided, import from sheet
    if (sheetUrl) {
      await this.createFromSheet(interaction, sheetUrl);
      return;
    }
    
    // Otherwise, show modal for manual entry
    await CreateCharacterCommand.showCreateModal(interaction);
  }

  /**
   * Create character from Google Sheet
   */
  async createFromSheet(interaction, sheetUrl) {
    const userId = interaction.user.id;

    // Validate URL format
    const urlPattern = /https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/;
    if (!urlPattern.test(sheetUrl)) {
      await interaction.reply({
        content: '❌ Invalid Google Sheets URL format. Please use a URL like:\n`https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit#gid=123456`',
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
        CharacterStorage.updateCharacter(userId, character.id, updates);
      }

      // Set the sheet URL
      CharacterStorage.setSheetUrl(userId, character.id, sheetUrl);

      await interaction.editReply({
        content: `✅ Character **${characterData.name}** created successfully from Google Sheet!\n\nThe sheet URL has been saved and you can sync updates with:\n• \`/char-sync-to-sheet\` - Push bot data to sheet\n• \`/char-sync-from-sheet\` - Pull sheet data to bot`,
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

