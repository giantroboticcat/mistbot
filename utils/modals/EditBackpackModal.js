import { ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder } from 'discord.js';

/**
 * Modal for editing backpack items and story tags
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
      .setTitle('Edit Backpack & Story Tags');

    // Backpack items input (pre-filled with current items)
    // Extract item strings from backpack objects (backpack items are stored as { id, item } objects)
    const backpackItems = character.backpack.map(item => typeof item === 'string' ? item : item.item);
    const backpackValue = backpackItems.join(', ');
    
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
    // Extract tag strings from story tag objects (story tags are stored as { id, tag } objects)
    const storyTagStrings = character.storyTags.map(tag => typeof tag === 'string' ? tag : tag.tag);
    const storyTagsValue = storyTagStrings.join(', ');
    
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

    modal.addLabelComponents(backpackLabel, storyTagsLabel);
    return modal;
  }
}

