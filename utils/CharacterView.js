import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { TagFormatter } from './TagFormatter.js';

/**
 * Shared utilities for displaying and formatting character information
 */
export class CharacterView {
  /**
   * Format character content for display
   * @param {Object} character - The character object
   * @param {Object} options - Optional formatting options
   * @param {string} options.ownerInfo - Optional owner information string (e.g., "*Owner: Name*")
   * @param {string} options.fellowshipInfo - Optional fellowship information string (e.g., "**Fellowship: Name**")
   * @returns {string} Formatted character content string
   */
  static formatCharacterContent(character, options = {}) {
    const { ownerInfo = '', fellowshipInfo = '' } = options;

    // Build response showing the character
    const themeParts = [];
    character.themes.forEach((theme) => {
      if (theme.tags.length > 0 || theme.weaknesses.length > 0) {
        // Extract tag names from objects and wrap burned ones with fire emojis
        const tagNames = theme.tags.map(t => {
          const tagText = typeof t === 'string' ? t : t.tag;
          const isBurned = typeof t === 'object' ? t.isBurned : false;
          return isBurned ? `🔥${tagText}🔥` : tagText;
        });
        const weaknessNames = theme.weaknesses.map(w => {
          const weakText = typeof w === 'string' ? w : w.tag;
          const isBurned = typeof w === 'object' ? w.isBurned : false;
          return isBurned ? `🔥${weakText}🔥` : weakText;
        });
        
        const formatted = TagFormatter.formatTagsAndWeaknessesInCodeBlock(tagNames, weaknessNames);
        
        // Wrap burned theme names with fire emojis on both sides
        const themeName = theme.isBurned ? `🔥${theme.name}🔥` : theme.name;
        themeParts.push(`**${themeName}:**\n${formatted}`);
      }
    });

    // Format statuses in a table format showing checked power levels
    const statusDisplay = TagFormatter.formatStatusesAsTable(character.tempStatuses);
    
    // Format backpack and story tags in yellow ANSI code blocks
    const backpackDisplay = character.backpack.length > 0 
      ? TagFormatter.formatTagsInCodeBlock(character.backpack)
      : 'None';
    const storyTagsDisplay = character.storyTags.length > 0
      ? TagFormatter.formatTagsInCodeBlock(character.storyTags)
      : 'None';
    
    // Build fellowship info string if provided
    const fellowshipString = fellowshipInfo ? `\n${fellowshipInfo}` : '';
    
    // Build owner info string if provided
    const ownerString = ownerInfo ? `\n${ownerInfo}` : '';
    
    const content = `**Character: ${character.name}**${fellowshipString}${ownerString}\n\n` +
      themeParts.join('\n\n') +
      `\n*Statuses:*\n${statusDisplay}\n\n\n*Backpack:*\n${backpackDisplay}\n\n*Story Tags:*\n${storyTagsDisplay}\n\n`;

    return content;
  }

  /**
   * Build interactive buttons for character editing
   * @param {Object} character - The character object
   * @returns {Array<ActionRowBuilder>} Array of action row builders with buttons
   */
  static buildCharacterButtons(character) {
    const rows = [];

    // Row 1: Edit buttons
    const editButton = new ButtonBuilder()
      .setCustomId(`edit_character_${character.id}`)
      .setLabel('Adjust Name/Themes')
      .setStyle(ButtonStyle.Primary);

    const backpackButton = new ButtonBuilder()
      .setCustomId(`edit_backpack_${character.id}`)
      .setLabel('Edit Backpack')
      .setStyle(ButtonStyle.Secondary);

    const row1Components = [editButton, backpackButton];

    const burnRefreshButton = new ButtonBuilder()
    .setCustomId(`burn_refresh_${character.id}`)
    .setLabel('Burn/Refresh Tags')
    .setStyle(ButtonStyle.Secondary);
    row1Components.push(burnRefreshButton);
    

    rows.push(new ActionRowBuilder().setComponents(row1Components));

    // Row 2: Sync buttons
    const setSheetButton = new ButtonBuilder()
    .setCustomId(`set_sheet_url_btn_${character.id}`)
    .setLabel('🔗 Set Sheet URL')
    .setStyle(ButtonStyle.Secondary);

    const syncToButton = new ButtonBuilder()
    .setCustomId(`sync_to_sheet_${character.id}`)
    .setLabel('📤 Sync to Sheet')
    .setStyle(ButtonStyle.Success)
    .setDisabled(!character.google_sheet_url);

    const syncFromButton = new ButtonBuilder()
    .setCustomId(`sync_from_sheet_${character.id}`)
    .setLabel('📥 Sync from Sheet')
    .setStyle(ButtonStyle.Success)
    .setDisabled(!character.google_sheet_url);

    rows.push(new ActionRowBuilder().setComponents([setSheetButton, syncToButton, syncFromButton]));
    

    // Row 3: Delete button
    const deleteButton = new ButtonBuilder()
    .setCustomId(`delete_character_${character.id}`)
    .setLabel('🗑️ Delete Character')
    .setStyle(ButtonStyle.Danger);

    rows.push(new ActionRowBuilder().setComponents([deleteButton]));
    

    return rows;
  }
}

