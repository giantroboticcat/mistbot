import { SlashCommandBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder } from 'discord.js';
import { Command } from './Command.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { CreateCharacterCommand } from './CreateCharacterCommand.js';

/**
 * Edit an existing character
 */
export class EditCharacterCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('edit-character')
      .setDescription('Edit one of your existing characters');
  }

  async execute(interaction) {
    const userId = interaction.user.id;
    const activeCharacter = CharacterStorage.getActiveCharacter(userId);

    if (!activeCharacter) {
      await interaction.reply({
        content: 'You don\'t have an active character. Use `/create-character` to create one, or `/select-character` to select an active character.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Show edit modal with pre-filled data for the active character
    await EditCharacterCommand.showEditModal(interaction, activeCharacter);
  }

  /**
   * Show edit modal for a character with pre-filled data
   * @param {import('discord.js').Interaction} interaction - The interaction
   * @param {Object} character - The character to edit
   */
  static async showEditModal(interaction, character) {
    const modal = new ModalBuilder()
      .setCustomId(`edit_character_modal_${character.id}`)
      .setTitle(`Edit Character: ${character.name}`);

    // Character name input (pre-filled)
    const nameInput = new TextInputBuilder()
      .setCustomId('character_name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter your character\'s name')
      .setValue(character.name)
      .setRequired(true)
      .setMaxLength(100);

    const nameLabel = new LabelBuilder()
      .setLabel('Character Name')
      .setTextInputComponent(nameInput);

    // Theme inputs (4 themes, pre-filled)
    const themeLabels = [];
    
    for (let i = 0; i < 4; i++) {
      const theme = character.themes[i] || { name: '', tags: [], weaknesses: [] };
      
      // Format theme data: "Name | tag1, tag2 | weakness1, weakness2"
      const themeValue = `${theme.name || ''} | ${theme.tags.join(', ')} | ${theme.weaknesses.join(', ')}`;
      
      const themeInput = new TextInputBuilder()
        .setCustomId(`theme_${i + 1}`)
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder(`Theme Name | tag1, tag2 | weakness1, weakness2`)
        .setValue(themeValue || '')
        .setRequired(true)
        .setMaxLength(1000);

      const themeLabel = new LabelBuilder()
        .setLabel(`Theme ${i + 1}`)
        .setTextInputComponent(themeInput);

      themeLabels.push(themeLabel);
    }

    modal.addLabelComponents(nameLabel, ...themeLabels);
    await interaction.showModal(modal);
  }
}

