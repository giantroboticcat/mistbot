import { SlashCommandBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { Command } from './Command.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';

/**
 * Set Google Sheets URL for a character
 */
export class SetSheetUrlCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('char-set-sheet-url')
      .setDescription('Set Google Sheets URL for your active character');
  }

  async execute(interaction) {
    const userId = interaction.user.id;
    const activeCharacter = CharacterStorage.getActiveCharacter(userId);

    if (!activeCharacter) {
      await interaction.reply({
        content: 'You don\'t have an active character. Use `/char-create` to create one, or `/char-select` to select an active character.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Show modal to input sheet URL
    const modal = new ModalBuilder()
      .setCustomId(`set_sheet_url_${activeCharacter.id}`)
      .setTitle('Set Google Sheet URL');

    const currentUrl = activeCharacter.google_sheet_url || '';

    const urlInput = new TextInputBuilder()
      .setCustomId('sheet_url')
      .setLabel('Google Sheets URL')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://docs.google.com/spreadsheets/d/...')
      .setValue(currentUrl)
      .setRequired(true);

    const actionRow = new ActionRowBuilder().addComponents(urlInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }

  /**
   * Handle modal submit
   */
  static async handleModalSubmit(interaction) {
    const characterId = parseInt(interaction.customId.split('_').pop());
    const userId = interaction.user.id;
    const sheetUrl = interaction.fields.getTextInputValue('sheet_url');

    // Validate URL format
    const urlPattern = /https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/;
    if (!urlPattern.test(sheetUrl)) {
      await interaction.reply({
        content: '❌ Invalid Google Sheets URL format. Please use a URL like:\n`https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit`',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Update character
    const success = CharacterStorage.setSheetUrl(userId, characterId, sheetUrl);

    if (success) {
      await interaction.reply({
        content: '✅ Google Sheets URL updated successfully!\n\nYou can now use:\n• `/char-sync-to-sheet` to push your character data to the sheet\n• `/char-sync-from-sheet` to pull data from the sheet',
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: '❌ Failed to update sheet URL. Character not found.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

