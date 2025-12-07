import { ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder } from 'discord.js';

/**
 * Modal for editing backpack items, story tags, and statuses
 * Uses Discord.js Components V2 (LabelBuilder)
 */
export class EditBackpackModal {
  /**
   * Build the edit backpack modal for a character using Components V2
   * @param {Object} character - The character to edit
   * @returns {ModalBuilder} The modal builder with Components V2 structure
   */
  static build(character) {
    const modal = new ModalBuilder()
      .setCustomId(`edit_backpack_modal_${character.id}`)
      .setTitle('Edit Backpack, Story Tags & Statuses');

    // Backpack items input (pre-filled with current items)
    const backpackValue = character.backpack.join(', ');
    
    const backpackInput = new TextInputBuilder()
      .setCustomId('backpack_items')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter backpack items separated by commas (e.g., item1, item2, item3)')
      .setValue(backpackValue)
      .setRequired(false)
      .setMaxLength(1000);

    const backpackLabel = new LabelBuilder()
      .setLabel('Backpack Items')
      .setTextInputComponent(backpackInput);

    // Story tags input (pre-filled with current tags)
    const storyTagsValue = character.storyTags.join(', ');
    
    const storyTagsInput = new TextInputBuilder()
      .setCustomId('story_tags')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter story tags separated by commas (e.g., tag1, tag2, tag3)')
      .setValue(storyTagsValue)
      .setRequired(false)
      .setMaxLength(1000);

    const storyTagsLabel = new LabelBuilder()
      .setLabel('Story Tags')
      .setTextInputComponent(storyTagsInput);

    // Statuses input (pre-filled with current statuses)
    // Format statuses as "name-power" for display
    const statusesValue = character.tempStatuses.map(s => {
      if (typeof s === 'string') return s;
      // Find highest power level
      let highestPower = 0;
      for (let p = 6; p >= 1; p--) {
        if (s.powerLevels && s.powerLevels[p]) {
          highestPower = p;
          break;
        }
      }
      return highestPower > 0 ? `${s.status}-${highestPower}` : s.status;
    }).join(', ');
    
    const statusesInput = new TextInputBuilder()
      .setCustomId('statuses')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter statuses separated by commas (e.g., sleeping-3, rested-2)')
      .setValue(statusesValue)
      .setRequired(false)
      .setMaxLength(1000);

    const statusesLabel = new LabelBuilder()
      .setLabel('Statuses')
      .setTextInputComponent(statusesInput);

    modal.addLabelComponents(backpackLabel, storyTagsLabel, statusesLabel);
    return modal;
  }
}

