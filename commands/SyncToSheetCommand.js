import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Command } from './Command.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';

/**
 * Sync character data TO Google Sheets
 */
export class SyncToSheetCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('char-sync-to-sheet')
      .setDescription('Push your active character data to Google Sheets');
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

    // Defer reply since this might take a moment
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Perform sync
    const result = await CharacterStorage.syncToSheet(userId, activeCharacter.id);

    if (result.success) {
      await interaction.editReply({
        content: `✅ ${result.message}\n\n**Character:** ${activeCharacter.name}`,
      });
    } else {
      await interaction.editReply({
        content: `❌ ${result.message}`,
      });
    }
  }

  /**
   * Handle button click for sync to sheet
   */
  static async handleButton(interaction, characterId) {
    const userId = interaction.user.id;
    
    // Verify character belongs to user
    const character = CharacterStorage.getCharacter(userId, characterId);
    if (!character) {
      await interaction.reply({
        content: '❌ Character not found or you don\'t have permission to sync it.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Defer reply
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Perform sync
    const result = await CharacterStorage.syncToSheet(userId, characterId);

    if (result.success) {
      await interaction.editReply({
        content: `✅ ${result.message}\n\n**Character:** ${character.name}`,
      });
    } else {
      await interaction.editReply({
        content: `❌ ${result.message}`,
      });
    }
  }
}

