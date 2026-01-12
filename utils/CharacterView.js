import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder } from 'discord.js';
import { DiscordUtils } from './DiscordUtils.js';
import { TagFormatter } from './TagFormatter.js';

/**
 * Shared utilities for displaying and formatting character information
 */
export class CharacterView {
  /**
   * Build character display containers using Components V2
   * @param {Object} character - The character object
   * @param {import('discord.js').Interaction} interaction - The interaction
   * @returns {Object} Object with container builders for different sections
   */
  static async buildCharacterDisplays(character, interaction) {
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
    // Extract item strings from backpack objects (backpack items are stored as { id, item } objects)
    const backpackItems = character.backpack.map(item => typeof item === 'string' ? item : item.item);
    const backpackDisplay = backpackItems.length > 0 
      ? TagFormatter.formatTagsInCodeBlock(backpackItems)
      : 'None';
    // Extract tag strings from story tag objects (story tags are stored as { id, tag } objects)
    const storyTagStrings = character.storyTags.map(tag => typeof tag === 'string' ? tag : tag.tag);
    const storyTagsDisplay = storyTagStrings.length > 0
      ? TagFormatter.formatTagsInCodeBlock(storyTagStrings)
      : 'None';
    
    // Build fellowship info string if provided
    const fellowshipString = character.fellowship ? `\n**Fellowship: ${character.fellowship.name}**` : '';
    
    // Build owner info string if provided
    const ownerName = await DiscordUtils.getUserDisplayName(interaction, character.user_id);
    const ownerString = ownerName ? `\n*Owner: ${ownerName}*` : '';
    
    // Header container
    const headerContainer = new ContainerBuilder();
    headerContainer.addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(`**Character: ${character.name}**${fellowshipString}${ownerString}`)
    );

    // Themes container
    const themesContainer = new ContainerBuilder();
    if (themeParts.length > 0) {
      themesContainer.addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(themeParts.join('\n\n'))
      );
    } else {
      themesContainer.addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent('No themes')
      );
    }

    // Statuses container
    const statusesContainer = new ContainerBuilder();
    statusesContainer.addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(`*Statuses:*\n${statusDisplay}`)
    );

    // Backpack container
    const backpackContainer = new ContainerBuilder();
    backpackContainer.addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(`*Backpack:*\n${backpackDisplay}`)
    );

    // Story tags container
    const storyTagsContainer = new ContainerBuilder();
    storyTagsContainer.addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(`*Story Tags:*\n${storyTagsDisplay}`)
    );

    return {
      headerContainer,
      themesContainer,
      statusesContainer,
      backpackContainer,
      storyTagsContainer
    };
  }

  /**
   * Format character content for display (legacy method, kept for backwards compatibility)
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
    // Extract item strings from backpack objects (backpack items are stored as { id, item } objects)
    const backpackItems = character.backpack.map(item => typeof item === 'string' ? item : item.item);
    const backpackDisplay = backpackItems.length > 0 
      ? TagFormatter.formatTagsInCodeBlock(backpackItems)
      : 'None';
    // Extract tag strings from story tag objects (story tags are stored as { id, tag } objects)
    const storyTagStrings = character.storyTags.map(tag => typeof tag === 'string' ? tag : tag.tag);
    const storyTagsDisplay = storyTagStrings.length > 0
      ? TagFormatter.formatTagsInCodeBlock(storyTagStrings)
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
   * @returns {Object} Object with buttonRows array
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
      .setStyle(ButtonStyle.Primary);

    const statusesButton = new ButtonBuilder()
      .setCustomId(`edit_statuses_${character.id}`)
      .setLabel('Edit Statuses')
      .setStyle(ButtonStyle.Primary);

    const row1Components = [editButton, backpackButton, statusesButton];

    const burnRefreshButton = new ButtonBuilder()
    .setCustomId(`burn_refresh_${character.id}`)
    .setLabel('Burn/Refresh Tags')
    .setStyle(ButtonStyle.Primary);
    row1Components.push(burnRefreshButton);
    

    rows.push(new ActionRowBuilder().setComponents(row1Components));

    // Row 2: Sync buttons
    const setSheetButton = new ButtonBuilder()
    .setCustomId(`set_sheet_url_btn_${character.id}`)
    .setLabel('🔗 Set Sheet URL')
    .setStyle(ButtonStyle.Primary);

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

    return {
      buttonRows: rows
    };
  }

  /**
   * Combine character display containers and interactive buttons
   * @param {Object} displayData - Object with container builders from buildCharacterDisplays
   * @param {Object} interactiveData - Object with buttonRows from buildCharacterButtons
   * @returns {Array} Combined array of components for Components V2
   */
  static combineCharacterComponents(displayData, interactiveData) {
    return [
      displayData.headerContainer,
      displayData.themesContainer,
      displayData.statusesContainer,
      displayData.backpackContainer,
      displayData.storyTagsContainer,
      ...(interactiveData.buttonRows || [])
    ];
  }
}

