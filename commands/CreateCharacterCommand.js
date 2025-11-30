import { SlashCommandBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder } from 'discord.js';
import { Command } from './Command.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { TagFormatter } from '../utils/TagFormatter.js';

/**
 * Create a new character with themes
 */
export class CreateCharacterCommand extends Command {
  getData() {
    return new SlashCommandBuilder()
      .setName('create-character')
      .setDescription('Create a new character with 4 themes');
  }

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('create_character_modal')
      .setTitle('Create Character');

    // Character name input
    const nameInput = new TextInputBuilder()
      .setCustomId('character_name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter your character\'s name')
      .setRequired(true)
      .setMaxLength(100);

    const nameLabel = new LabelBuilder()
      .setLabel('Character Name')
      .setTextInputComponent(nameInput);

    // Theme inputs (4 themes)
    const themeInputs = [];
    const themeLabels = [];
    
    for (let i = 1; i <= 4; i++) {
      const themeInput = new TextInputBuilder()
        .setCustomId(`theme_${i}`)
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder(`Theme Name | tag1, tag2 | weakness1, weakness2`)
        .setRequired(true)
        .setMaxLength(1000);

      const themeLabel = new LabelBuilder()
        .setLabel(`Theme ${i}`)
        .setTextInputComponent(themeInput);

      themeInputs.push(themeInput);
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

