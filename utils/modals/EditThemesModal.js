import { ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder } from 'discord.js';

/**
 * Modal for editing character name and themes
 * Uses Discord.js Components V2 (LabelBuilder)
 */
export class EditThemesModal {
  /**
   * Build the edit themes modal for a character using Components V2
   * @param {Object} character - The character to edit
   * @returns {ModalBuilder} The modal builder with Components V2 structure
   */
  static build(character) {
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
      
      // Extract tag names from objects
      const tagNames = theme.tags.map(t => typeof t === 'string' ? t : t.tag);
      const weaknessNames = theme.weaknesses.map(w => typeof w === 'string' ? w : w.tag);
      
      // Format theme data: "Name | tag1, tag2 | weakness1, weakness2"
      const themeValue = `${theme.name || ''} | ${tagNames.join(', ')} | ${weaknessNames.join(', ')}`;
      
      const themeInput = new TextInputBuilder()
        .setCustomId(`theme_${i + 1}`)
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Theme Name | tag1, tag2 | weakness1, weakness2')
        .setValue(themeValue || '')
        .setRequired(true)
        .setMaxLength(1000);

      const themeLabel = new LabelBuilder()
        .setLabel(`Theme ${i + 1}`)
        .setTextInputComponent(themeInput);

      themeLabels.push(themeLabel);
    }

    modal.addLabelComponents(nameLabel, ...themeLabels);
    return modal;
  }
}

