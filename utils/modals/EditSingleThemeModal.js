import { ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder } from 'discord.js';

/**
 * Modal for editing a single theme
 * Uses Discord.js Components V2 (LabelBuilder)
 * 
 * Fields:
 * - Theme Name
 * - 6 fields for helpful tags
 * - 2 fields for weakness tags
 * - 1 field for quest (paragraph text, a few sentences)
 */
export class EditSingleThemeModal {
  /**
   * Build the edit single theme modal using Components V2
   * @param {Object} theme - The theme to edit (with id, name, tags, weaknesses, quest)
   * @param {number} themeIndex - The index of the theme (0-3) for display
   * @param {number} characterId - The character ID
   * @param {string|null} messageId - The message ID to edit after submission (optional)
   * @returns {ModalBuilder} The modal builder with Components V2 structure
   */
  static build(theme, themeIndex, characterId, messageId = null) {
    // Include messageId in customId if provided: edit_theme_modal_{characterId}_{themeId}_{messageId}
    const customId = messageId 
      ? `edit_theme_modal_${characterId}_${theme.id}_${messageId}`
      : `edit_theme_modal_${characterId}_${theme.id}`;
    
    const modal = new ModalBuilder()
      .setCustomId(customId)
      .setTitle(`Edit Theme ${themeIndex + 1}: ${theme.name || 'Untitled'}`);

    // Theme name input (pre-filled)
    const nameInput = new TextInputBuilder()
      .setCustomId('theme_name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter theme name')
      .setValue(theme.name || '')
      .setRequired(true)
      .setMaxLength(100);

    const nameLabel = new LabelBuilder()
      .setLabel('Theme Name')
      .setTextInputComponent(nameInput);

    // Helpful tags (comma-separated in one field)
    const tagNames = (theme.tags || []).map(t => typeof t === 'string' ? t : t.tag);
    const tagsInput = new TextInputBuilder()
      .setCustomId('helpful_tags')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter helpful tags separated by commas (e.g., "Strong, Fast, Agile")')
      .setValue(tagNames.join(', '))
      .setRequired(false)
      .setMaxLength(500);

    const tagsLabel = new LabelBuilder()
      .setLabel('Helpful Tags')
      .setTextInputComponent(tagsInput);

    // Weakness tags (comma-separated in one field)
    const weaknessNames = (theme.weaknesses || []).map(w => typeof w === 'string' ? w : w.tag);
    const weaknessesInput = new TextInputBuilder()
      .setCustomId('weakness_tags')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter weakness tags separated by commas (e.g., "Clumsy, Fearful")')
      .setValue(weaknessNames.join(', '))
      .setRequired(false)
      .setMaxLength(200);

    const weaknessesLabel = new LabelBuilder()
      .setLabel('Weakness Tags')
      .setTextInputComponent(weaknessesInput);

    // Quest field (paragraph style for multiple sentences)
    const questInput = new TextInputBuilder()
      .setCustomId('quest')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter quest text')
      .setValue(theme.quest || '')
      .setRequired(false)
      .setMaxLength(1000);

    const questLabel = new LabelBuilder()
      .setLabel('Quest')
      .setTextInputComponent(questInput);

    // Total: 1 (name) + 1 (tags) + 1 (weaknesses) + 1 (quest) = 4 components (under the 5 limit)
    modal.addLabelComponents(nameLabel, tagsLabel, weaknessesLabel, questLabel);
    return modal;
  }
}

