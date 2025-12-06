import { SlashCommandBuilder, MessageFlags, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { Command } from './Command.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';

/**
 * Select an active character
 */
export class SelectCharacterCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('char-select')
      .setDescription('Select which character is currently active');
  }

  async execute(interaction) {
    const userId = interaction.user.id;
    const characters = CharacterStorage.getUserCharacters(userId);

    if (characters.length === 0) {
      await interaction.reply({
        content: 'You don\'t have any characters yet. Use `/char-create` with a Google Sheets URL to import a character.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get current active character
    const activeCharacterId = CharacterStorage.getActiveCharacterId(userId);

    // Create a select menu to choose which character to make active
    const options = characters.map(char => {
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(char.name)
        .setValue(char.id.toString());
      
      // Mark the currently active character
      if (activeCharacterId === char.id) {
        option.setDefault(true);
      }
      
      return option;
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`select_active_character_${userId}`)
      .setPlaceholder('Select a character to make active...')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options);

    const selectRow = new ActionRowBuilder().setComponents([selectMenu]);

    await interaction.reply({
      content: '**Select your active character:**',
      components: [selectRow],
      flags: MessageFlags.Ephemeral,
    });
  }
}

