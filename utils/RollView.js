import { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ContainerBuilder, TextDisplayBuilder } from 'discord.js';
import { TagFormatter } from './TagFormatter.js';
import { Validation } from './Validation.js';

/**
 * Shared utilities for displaying and formatting roll information
 */
export class RollView {
  /**
   * Format roll proposal content with selected tags using Components V2
   * @param {Set<string>} helpTags - Set of help tag values (with prefixes)
   * @param {Set<string>} hinderTags - Set of hinder tag values (with prefixes)
   * @param {string|null} description - Optional description of what the roll is for
   * @param {boolean} showPower - Whether to show the power modifier
   * @param {Set<string>} burnedTags - Set of burned tag values (with prefixes)
   * @param {Object} options - Additional options
   * @param {string} options.title - Custom title
   * @param {string} options.footer - Footer text
   * @param {string} options.descriptionText - Additional text to insert after title
   * @returns {Object} Object with components array and IsComponentsV2 flag
   */
  static buildRollDisplays(helpTags, hinderTags, description = null, showPower = true, burnedTags = new Set(), options = {}) {
    // Parse help tags (extract actual names)
    const helpItemNames = Array.from(helpTags).map(value => {
      // Remove prefix (theme:, tag:, backpack:, etc.)
      const parts = value.split(':');
      return parts.length > 1 ? parts.slice(1).join(':') : value;
    });

    // Parse hinder tags (extract actual names, separate weaknesses)
    const hinderItemNames = [];
    const hinderWeaknesses = [];
    
    Array.from(hinderTags).forEach(value => {
      const parts = value.split(':');
      const name = parts.length > 1 ? parts.slice(1).join(':') : value;
      
      if (value.startsWith('weakness:') || value.startsWith('fellowshipWeakness:')) {
        hinderWeaknesses.push(name);
      } else {
        hinderItemNames.push(name);
      }
    });

    // Categorize help items
    const helpCategorized = this.categorizeItems(helpItemNames);
    
    // Categorize hinder items
    const hinderCategorized = this.categorizeItems(hinderItemNames);

    // Calculate modifier using status values and burned tags
    const modifier = this.calculateModifier(helpTags, hinderTags, burnedTags);
    const modifierText = modifier >= 0 ? `+${modifier}` : `${modifier}`;

    // Identify burned help tags and add fire emojis around them
    const burnedHelpTagNames = new Set();
    Array.from(helpTags).forEach(tagValue => {
      if (burnedTags.has(tagValue)) {
        const parts = tagValue.split(':');
        const tagName = parts.length > 1 ? parts.slice(1).join(':') : tagValue;
        burnedHelpTagNames.add(tagName);
      }
    });

    // Format help items (tags, statuses) with fire emojis around burned tags
    const helpParts = [];
    if (helpCategorized.tags.length > 0 || helpCategorized.statuses.length > 0) {
      // Format tags with fire emojis for burned ones
      const formattedTags = helpCategorized.tags.map(tag => {
        const isBurned = burnedHelpTagNames.has(tag);
        const formatted = TagFormatter.formatStoryTag(tag);
        return isBurned ? `🔥 ${formatted} 🔥` : formatted;
      });
      
      // Format statuses (statuses can't be burned)
      const formattedStatuses = helpCategorized.statuses.map(status => 
        TagFormatter.formatStatus(status)
      );
      
      
      if (formattedTags.length > 0) {
        helpParts.push(formattedTags.join(', '));
      }
      if (formattedStatuses.length > 0) {
        helpParts.push(formattedStatuses.join(', '));
      }   

    }
    const helpFormatted = helpParts.length > 0
      ? `\`\`\`ansi\n${helpParts.join(', ')}\n\`\`\``
      : '```\nNone\n```';
    
    // Format hinder items (tags, statuses, plus weaknesses)
    const hinderParts = [];
    if (hinderCategorized.tags.length > 0) {
      hinderParts.push(TagFormatter.formatStoryTags(hinderCategorized.tags));
    }
    if (hinderCategorized.statuses.length > 0) {
      hinderParts.push(TagFormatter.formatStatuses(hinderCategorized.statuses));
    }
    if (hinderWeaknesses.length > 0) {
      hinderParts.push(TagFormatter.formatWeaknesses(hinderWeaknesses));
    }
    
    const hinderFormatted = hinderParts.length > 0
      ? `\`\`\`ansi\n${hinderParts.join(', ')}\n\`\`\``
      : '```\nNone\n```';
    
    // Create a container for the roll display
    const descriptionContainer = new ContainerBuilder();
    
    // Add title text display directly to container
    descriptionContainer.addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(`## ${options.title || description }`)
    );
    
    // Add power text display if requested (moved to top, before narration)
    if (showPower) {
      descriptionContainer.addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(`### Power **${modifierText}**`)
      );
    }
    
    // Add narration link if provided
    if (options.narrationLink) {
      descriptionContainer.addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(`**Narration:** ${options.narrationLink}`)
    );
    }
    
    // Add justification notes if provided (display in proposal view)
    if (options.justificationNotes) {
      descriptionContainer.addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(`**Justification Notes:**\n${options.justificationNotes}`)
      );
    } else if (options.showJustificationPlaceholder) {
      // Just show the header - the button will make it obvious what to do
      descriptionContainer.addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(`**Justification Notes:**`)
      );
    }
    
    // Add description text if provided (e.g., player mention, confirmed by, etc.)
    if (options.descriptionText) {
      descriptionContainer.addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(options.descriptionText)
      );
    }
    
    // Help tags in its own container
    const helpContainer = new ContainerBuilder();
    helpContainer.addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(`### Help Tags\n${helpFormatted}`)
    );
    
    // Hinder tags in its own container
    const hinderContainer = new ContainerBuilder();
    hinderContainer.addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(`### Hinder Tags\n${hinderFormatted}`)
    );
    
    const footerContainer = new ContainerBuilder();
    if (options.footer) {
      footerContainer.addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(`*${options.footer}*`)
      );
    }
    
    // Return structure that allows inserting interactive components between display sections
    return { 
      descriptionContainer,
      helpContainer,
      hinderContainer,
      footerContainer
    };
  }

  /**
   * Build roll components with pagination support
   * @param {string|number} rollKey - Unique identifier for this roll (string for temp, number for stored)
   * @param {Array} helpOptions - All available help tag options
   * @param {Array} hinderOptions - All available hinder tag options
   * @param {number} helpPage - Current help page (0-indexed)
   * @param {number} hinderPage - Current hinder page (0-indexed)
   * @param {Set<string>} selectedHelpTags - Currently selected help tags
   * @param {Set<string>} selectedHinderTags - Currently selected hinder tags
   * @param {object} buttons - Array of which buttons to add to the submit rows
   * @param {boolean} buttons.submit
   * @param {boolean} buttons.confirm
   * @param {boolean} buttons.cancel
   * @param {Set<string>} burnedTags - Currently selected tags to burn
   * @returns {Array} Array of ActionRowBuilder components
   */
  static buildRollInteractives(rollKey, helpOptions, hinderOptions, helpPage, hinderPage, selectedHelpTags = new Set(), selectedHinderTags = new Set(), buttons = {}, burnedTags = new Set(), justificationNotes = null, showJustificationButton = true) {
    // Show all options, but mark selected ones as default
    const helpPages = Math.ceil(helpOptions.length / 25);
    const hinderPages = Math.ceil(hinderOptions.length / 25);
    
    // Clamp page indices to valid ranges
    const clampedHelpPage = Math.min(helpPage, Math.max(0, helpPages - 1));
    const clampedHinderPage = Math.min(hinderPage, Math.max(0, hinderPages - 1));
    
    const descriptionRows = [];
    const helpRows = [];
    const hinderRows = [];
    const submitRows = [];
    
    // Help tag select menu (current page) - show all options, mark selected ones
    const helpStart = clampedHelpPage * 25;
    const helpEnd = Math.min(helpStart + 25, helpOptions.length);
    const helpPageOptions = helpOptions.slice(helpStart, helpEnd).map(opt => {
      const isSelected = selectedHelpTags.has(opt.data.value);
      return new StringSelectMenuOptionBuilder()
        .setLabel(opt.data.label)
        .setValue(opt.data.value)
        .setDescription(opt.data.description)
        .setDefault(isSelected);
    });
    
    const helpSelect = new StringSelectMenuBuilder()
      .setCustomId(`roll_help_${rollKey}`)
      .setPlaceholder('Select tags that help the roll...')
      .setMinValues(0)
      .setMaxValues(Math.min(helpPageOptions.length, 25))
      .addOptions(helpPageOptions);
    
    // Main help dropdown on its own row (one select per row)
    helpRows.push(new ActionRowBuilder().setComponents([helpSelect]));
    
    // Help page selector on its own row if needed
    if (helpPages > 1) {
      const helpPageOptions = [];
      for (let i = 0; i < helpPages; i++) {
        const start = i * 25;
        const end = Math.min(start + 25, helpOptions.length);
        helpPageOptions.push(new StringSelectMenuOptionBuilder()
          .setLabel(`Help Page ${i + 1} (${start + 1}-${end})`)
          .setValue(`${i}`)
          .setDescription(`View options ${start + 1} to ${end}`)
          .setDefault(i === clampedHelpPage));
      }
      const helpPageSelect = new StringSelectMenuBuilder()
        .setCustomId(`roll_help_page_${rollKey}`)
        .setPlaceholder('Select page...')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(helpPageOptions);
      helpRows.push(new ActionRowBuilder().setComponents([helpPageSelect]));
    }
    
    // Burn selection dropdown - only show selected help tags that are burnable (non-status tags, non-fellowship tags)
    // Put on its own row (one select per row)
    const burnableTags = Array.from(selectedHelpTags).filter(tagValue => {
      // Fellowship tags cannot be burned
      if (tagValue.startsWith('fellowship:')) {
        return false;
      }
      const parts = tagValue.split(':');
      const tagName = parts.length > 1 ? parts.slice(1).join(':') : tagValue;
      // Only non-status tags can be burned
      return !Validation.validateStatus(tagName).valid;
    });
    
    if (burnableTags.length > 0) {
      // Find the labels for burnable tags from helpOptions
      const burnOptions = burnableTags.map(tagValue => {
        const option = helpOptions.find(opt => opt.data.value === tagValue);
        const label = option ? option.data.label.replace(' 🔥', '') : tagValue; // Remove existing burn indicator
        const isBurned = burnedTags.has(tagValue);
        return new StringSelectMenuOptionBuilder()
          .setLabel(`${isBurned ? '🔥 ' : ''}${label}`)
          .setValue(tagValue)
          .setDescription('Burn this tag for +3 modifier (instead of +1)')
          .setDefault(isBurned);
      });
      
      // Add burn selection dropdown (first page only for now, will be enhanced if needed)
      const burnPageOptions = burnOptions.slice(0, 25).map(opt => {
        const isBurned = burnedTags.has(opt.data.value);
        return new StringSelectMenuOptionBuilder()
          .setLabel(opt.data.label)
          .setValue(opt.data.value)
          .setDescription(opt.data.description)
          .setDefault(isBurned);
      });
      
      const burnSelect = new StringSelectMenuBuilder()
        .setCustomId(`roll_burn_${rollKey}`)
        .setPlaceholder('Select ONE tag to burn (+3 modifier)...')
        .setMinValues(0)
        .setMaxValues(1)
        .addOptions(burnPageOptions);
      helpRows.push(new ActionRowBuilder().setComponents([burnSelect]));
    }
    
    // Hinder tag select menu (current page) - show all options, mark selected ones
    const hinderStart = clampedHinderPage * 25;
    const hinderEnd = Math.min(hinderStart + 25, hinderOptions.length);
    const hinderPageOptions = hinderOptions.slice(hinderStart, hinderEnd).map(opt => {
      const isSelected = selectedHinderTags.has(opt.data.value);
      return new StringSelectMenuOptionBuilder()
        .setLabel(opt.data.label)
        .setValue(opt.data.value)
        .setDescription(opt.data.description)
        .setDefault(isSelected);
    });
    
    const hinderSelect = new StringSelectMenuBuilder()
      .setCustomId(`roll_hinder_${rollKey}`)
      .setPlaceholder('Select tags that hinder the roll...')
      .setMinValues(0)
      .setMaxValues(Math.min(hinderPageOptions.length, 25))
      .addOptions(hinderPageOptions);
    
    // Main hinder dropdown on its own row (one select per row)
    hinderRows.push(new ActionRowBuilder().setComponents([hinderSelect]));
    
    // Hinder page selector on its own row if needed
    if (hinderPages > 1) {
      const hinderPageOptions = [];
      for (let i = 0; i < hinderPages; i++) {
        const start = i * 25;
        const end = Math.min(start + 25, hinderOptions.length);
        hinderPageOptions.push(new StringSelectMenuOptionBuilder()
          .setLabel(`Hinder Page ${i + 1} (${start + 1}-${end})`)
          .setValue(`${i}`)
          .setDescription(`View options ${start + 1} to ${end}`)
          .setDefault(i === clampedHinderPage));
      }
      const hinderPageSelect = new StringSelectMenuBuilder()
        .setCustomId(`roll_hinder_page_${rollKey}`)
        .setPlaceholder('Select page...')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(hinderPageOptions);
      hinderRows.push(new ActionRowBuilder().setComponents([hinderPageSelect]));
    }
    
    // Justification notes button - only show if not in confirm view
    // This will appear above the help container
    if (showJustificationButton) {
      const justificationButton = new ButtonBuilder()
        .setCustomId(`roll_edit_justification_${rollKey}`)
        .setLabel(justificationNotes ? 'Edit Justification Notes' : 'Add Justification Notes')
        .setStyle(ButtonStyle.Primary);
      descriptionRows.push(new ActionRowBuilder().setComponents([justificationButton]));
    }
    
    let buttonsArray = [];
    if (buttons?.submit) {
      const button = new ButtonBuilder()
        .setCustomId(`roll_submit_${rollKey}`)
        .setLabel('Submit')
        .setStyle(ButtonStyle.Primary);
      buttonsArray.push(button);
    }
    if (buttons?.confirm) {
      const button = new ButtonBuilder()
        .setCustomId(`roll_confirm_${rollKey}`)
        .setLabel('Confirm Roll')
        .setStyle(ButtonStyle.Success);
      buttonsArray.push(button);
    }
    if (buttons?.cancel) {
      const button = new ButtonBuilder()
        .setCustomId(`roll_cancel_${rollKey}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Primary);
      buttonsArray.push(button);
    } 
    
    submitRows.push(new ActionRowBuilder().setComponents(buttonsArray));
    
    return {
      descriptionRows,
      helpRows,
      hinderRows,
      submitRows
    };
  }

  /**
   * Collect all tags available for helping a roll
   * Includes: theme tags, theme names, backpack, storyTags, tempStatuses, scene tags, scene statuses
   * Excludes: burned tags (unless includeBurned is true)
   * @param {Object} character - Character object
   * @param {string} sceneId - Scene ID
   * @param {Object} StoryTagStorage - StoryTagStorage class
   * @param {boolean} includeBurned - Whether to include burned tags (default: false)
   */
  static collectHelpTags(character, sceneId, StoryTagStorage, includeBurned = false, guildId = null) {
    const options = [];
    const seen = new Set();

    // Theme names (as tags) - yellow tag icon
    character.themes.forEach(theme => {
      const tagValue = `theme:${theme.name}`;
      if (theme.name && !seen.has(tagValue)) {
        const isBurned = theme.isBurned || false;
        // Skip if burned and not including burned tags
        if (!includeBurned && isBurned) {
          return;
        }
        const isStatus = Validation.validateStatus(theme.name).valid;
        const icon = isStatus ? '🟢' : '🟡'; // Green for status, yellow for tag
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`${icon} ${theme.name}${isBurned ? ' 🔥' : ''}`)
          .setValue(tagValue)
          .setDescription(`Theme: ${theme.name}${isBurned ? ' (Burned)' : ''}`));
        seen.add(tagValue);
      }
    });

    // Theme tags - yellow tag icon, show which theme
    character.themes.forEach(theme => {
      theme.tags.forEach(tagObj => {
        const tag = typeof tagObj === 'string' ? tagObj : tagObj.tag;
        const isBurned = typeof tagObj === 'object' ? (tagObj.isBurned || false) : false;
        const tagValue = `tag:${tag}`;
        if (!seen.has(tagValue)) {
          // Skip if burned and not including burned tags
          if (!includeBurned && isBurned) {
            return;
          }
          options.push(new StringSelectMenuOptionBuilder()
            .setLabel(`🟡 ${tag}${isBurned ? ' 🔥' : ''}`)
            .setValue(tagValue)
            .setDescription(`Theme: ${theme.name}${isBurned ? ' (Burned)' : ''}`));
          seen.add(tagValue);
        }
      });
    });

    // Backpack tags - yellow tag icon (cannot be burned, just deleted)
    character.backpack.forEach(tag => {
      const tagValue = `backpack:${tag}`;
      if (!seen.has(tagValue)) {
        const isStatus = Validation.validateStatus(tag).valid;
        const icon = isStatus ? '🟢' : '🟡'; // Green for status, yellow for tag
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`${icon} ${tag}`)
          .setValue(tagValue)
          .setDescription('Backpack Item'));
        seen.add(tagValue);
      }
    });

    // Character story tags - yellow tag icon (cannot be burned, just deleted)
    character.storyTags.forEach(tag => {
      const tagValue = `story:${tag}`;
      if (!seen.has(tagValue)) {
        const isStatus = Validation.validateStatus(tag).valid;
        const icon = isStatus ? '🟢' : '🟡'; // Green for status, yellow for tag
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`${icon} ${tag}`)
          .setValue(tagValue)
          .setDescription('Character Story Tag'));
        seen.add(tagValue);
      }
    });

    // Character temp statuses - green status icon
    character.tempStatuses.forEach(statusObj => {
      // Extract status name and format with power level
      let statusDisplay;
      if (typeof statusObj === 'string') {
        statusDisplay = statusObj;
      } else {
        // Find highest power level
        let highestPower = 0;
        for (let p = 6; p >= 1; p--) {
          if (statusObj.powerLevels && statusObj.powerLevels[p]) {
            highestPower = p;
            break;
          }
        }
        statusDisplay = highestPower > 0 ? `${statusObj.status}-${highestPower}` : statusObj.status;
      }
      
      if (!seen.has(`tempStatus:${statusDisplay}`)) {
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`🟢 ${statusDisplay}`)
          .setValue(`tempStatus:${statusDisplay}`)
          .setDescription('Character Status'));
        seen.add(`tempStatus:${statusDisplay}`);
      }
    });

    // Scene tags - yellow tag icon
    const sceneTags = guildId ? StoryTagStorage.getTags(guildId, sceneId) : [];
    sceneTags.forEach(tag => {
      const tagValue = `sceneTag:${tag}`;
      if (!seen.has(tagValue)) {
        // Scene tags can't be burned (they're not character-owned)
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`🟡 ${tag}`)
          .setValue(tagValue)
          .setDescription('Scene Tag'));
        seen.add(tagValue);
      }
    });

    // Scene statuses - green status icon
    const sceneStatuses = guildId ? StoryTagStorage.getStatuses(guildId, sceneId) : [];
    sceneStatuses.forEach(status => {
      const tagValue = `sceneStatus:${status}`;
      if (!seen.has(tagValue)) {
        // Scene statuses can't be burned (they're not character-owned)
        options.push(new StringSelectMenuOptionBuilder()
          .setLabel(`🟢 ${status}`)
          .setValue(tagValue)
          .setDescription('Scene Status'));
        seen.add(tagValue);
      }
    });

    // Fellowship tags - yellow tag icon (cannot be burned)
    if (character.fellowship && character.fellowship.tags) {
      character.fellowship.tags.forEach(tag => {
        const tagValue = `fellowship:${tag}`;
        if (!seen.has(tagValue)) {
          options.push(new StringSelectMenuOptionBuilder()
            .setLabel(`🟡 ${tag}`)
            .setValue(tagValue)
            .setDescription(`Fellowship: ${character.fellowship.name}`));
          seen.add(tagValue);
        }
      });
    }

    return options;
  }

  /**
   * Collect all tags + weaknesses available for hindering a roll
   * Includes: everything from help tags PLUS theme weaknesses
   * @param {Object} character - Character object
   * @param {string} sceneId - Scene ID
   * @param {Object} StoryTagStorage - StoryTagStorage class
   * @param {boolean} includeBurned - Whether to include burned tags (default: false)
   */
  static collectHinderTags(character, sceneId, StoryTagStorage, includeBurned = false, guildId = null) {
    const options = this.collectHelpTags(character, sceneId, StoryTagStorage, includeBurned, guildId);
    const seen = new Set(options.map(opt => opt.data.value));

    // Add theme weaknesses - orange weakness icon, show which theme
    // Weaknesses can't be burned
    character.themes.forEach(theme => {
      theme.weaknesses.forEach(weaknessObj => {
        const weakness = typeof weaknessObj === 'string' ? weaknessObj : weaknessObj.tag;
        if (!seen.has(`weakness:${weakness}`)) {
          options.push(new StringSelectMenuOptionBuilder()
            .setLabel(`🟠 ${weakness}`)
            .setValue(`weakness:${weakness}`)
            .setDescription(`Weakness: ${theme.name}`));
          seen.add(`weakness:${weakness}`);
        }
      });
    });

    // Fellowship weaknesses - orange weakness icon (cannot be burned)
    if (character.fellowship && character.fellowship.weaknesses) {
      character.fellowship.weaknesses.forEach(weakness => {
        if (!seen.has(`fellowshipWeakness:${weakness}`)) {
          options.push(new StringSelectMenuOptionBuilder()
            .setLabel(`🟠 ${weakness}`)
            .setValue(`fellowshipWeakness:${weakness}`)
            .setDescription(`Fellowship Weakness: ${character.fellowship.name}`));
          seen.add(`fellowshipWeakness:${weakness}`);
        }
      });
    }

    return options;
  }

  /**
   * Extract numeric value from a status (e.g., "sleeping-3" -> 3)
   * Returns 1 if not a status or no number found
   * @param {string} tagName - The tag/status name
   * @returns {number} The numeric value or 1
   */
  static extractStatusValue(tagName) {
    // Statuses end with -number pattern
    const match = tagName.match(/-(\d+)$/);
    return match ? parseInt(match[1], 10) : 1;
  }

  /**
   * Calculate modifier from selected tags
   * Only the highest status value is used per side, plus all non-status tags count as ±1
   * Burned tags give +3 instead of +1
   * @param {Set<string>} helpTags - Set of help tag values (with prefixes)
   * @param {Set<string>} hinderTags - Set of hinder tag values (with prefixes)
   * @param {Set<string>} burnedTags - Set of burned tag values (with prefixes)
   * @returns {number} The calculated modifier
   */
  static calculateModifier(helpTags, hinderTags, burnedTags = new Set()) {
    // Calculate help modifier
    const helpStatuses = [];
    let helpTagCount = 0;
    let burnedHelpCount = 0;

    Array.from(helpTags).forEach(value => {
      const parts = value.split(':');
      const tagName = parts.length > 1 ? parts.slice(1).join(':') : value;
      const isBurned = burnedTags.has(value);
      
      if (Validation.validateStatus(tagName).valid) {
        // It's a status, extract its value
        // Note: Statuses can't be burned (only tags can be burned)
        helpStatuses.push(this.extractStatusValue(tagName));
      } else {
        // It's a non-status tag
        if (isBurned) {
          burnedHelpCount++;
        } else {
          helpTagCount++;
        }
      }
    });

    // Use only the highest status value (or 0 if no statuses)
    const highestHelpStatus = helpStatuses.length > 0 ? Math.max(...helpStatuses) : 0;
    // Burned tags give +3 each, regular tags give +1 each
    const helpModifier = highestHelpStatus + helpTagCount + (burnedHelpCount * 3);

    // Calculate hinder modifier
    const hinderStatuses = [];
    let hinderTagCount = 0;

    Array.from(hinderTags).forEach(value => {
      // Skip weaknesses for modifier calculation (they're just tags)
      if (value.startsWith('weakness:') || value.startsWith('fellowshipWeakness:')) {
        hinderTagCount++;
        return;
      }

      const parts = value.split(':');
      const tagName = parts.length > 1 ? parts.slice(1).join(':') : value;
      
      if (Validation.validateStatus(tagName).valid) {
        // It's a status, extract its value
        hinderStatuses.push(this.extractStatusValue(tagName));
      } else {
        // It's a non-status tag, count it
        hinderTagCount++;
      }
    });

    // Use only the highest status value (or 0 if no statuses)
    const highestHinderStatus = hinderStatuses.length > 0 ? Math.max(...hinderStatuses) : 0;
    const hinderModifier = highestHinderStatus + hinderTagCount;

    return helpModifier - hinderModifier;
  }

  /**
   * Categorize items into tags and statuses based on their format
   * @param {string[]} items - Array of item names
   * @returns {{ tags: string[], statuses: string[] }}
   */
  static categorizeItems(items) {
    const tags = [];
    const statuses = [];

    items.forEach(item => {
      if (Validation.validateStatus(item).valid) {
        statuses.push(item);
      } else {
        tags.push(item);
      }
    });

    return { tags, statuses };
  }

  /**
   * Parse and format help tags with burned indicators
   * @param {Set<string>} helpTags - Set of help tag values (with prefixes)
   * @param {Set<string>} burnedTags - Set of burned tag values (with prefixes)
   * @returns {string} Formatted help tags string
   */
  static formatHelpTagsForResult(helpTags, burnedTags = new Set()) {
    // Parse help tags (extract actual names)
    const helpItemNames = Array.from(helpTags).map(value => {
      const parts = value.split(':');
      return parts.length > 1 ? parts.slice(1).join(':') : value;
    });

    // Identify burned help tag names
    const burnedHelpTagNames = new Set();
    Array.from(helpTags).forEach(tagValue => {
      if (burnedTags.has(tagValue)) {
        const parts = tagValue.split(':');
        const tagName = parts.length > 1 ? parts.slice(1).join(':') : tagValue;
        burnedHelpTagNames.add(tagName);
      }
    });

    // Categorize help items
    const helpCategorized = this.categorizeItems(helpItemNames);

    // Format help items (tags, statuses) with fire emojis around burned tags
    let helpFormatted = 'None';
    if (helpCategorized.tags.length > 0 || helpCategorized.statuses.length > 0) {
      // Format tags with fire emojis for burned ones
      const formattedTags = helpCategorized.tags.map(tag => {
        const isBurned = burnedHelpTagNames.has(tag);
        const formatted = TagFormatter.formatStoryTag(tag);
        return isBurned ? `🔥 ${formatted} 🔥` : formatted;
      });
      
      // Format statuses (statuses can't be burned)
      const formattedStatuses = helpCategorized.statuses.map(status => 
        TagFormatter.formatStatus(status)
      );
      
      const parts = [];
      if (formattedTags.length > 0) {
        parts.push(formattedTags.join(', '));
      }
      if (formattedStatuses.length > 0) {
        parts.push(formattedStatuses.join(', '));
      }
      
      if (parts.length > 0) {
        helpFormatted = `\`\`\`ansi\n${parts.join(', ')}\n\`\`\``;
      }
    }

    return helpFormatted;
  }

  /**
   * Parse and format hinder tags
   * @param {Set<string>} hinderTags - Set of hinder tag values (with prefixes)
   * @returns {string} Formatted hinder tags string
   */
  static formatHinderTagsForResult(hinderTags) {
    // Parse hinder tags (extract actual names, separate weaknesses)
    const hinderItemNames = [];
    const hinderWeaknesses = [];
    
    Array.from(hinderTags).forEach(value => {
      const parts = value.split(':');
      const name = parts.length > 1 ? parts.slice(1).join(':') : value;
      
      if (value.startsWith('weakness:') || value.startsWith('fellowshipWeakness:')) {
        hinderWeaknesses.push(name);
      } else {
        hinderItemNames.push(name);
      }
    });

    // Categorize hinder items
    const hinderCategorized = this.categorizeItems(hinderItemNames);

    // Format hinder items (tags, statuses, plus weaknesses)
    const hinderParts = [];
    if (hinderCategorized.tags.length > 0) {
      hinderParts.push(TagFormatter.formatStoryTags(hinderCategorized.tags));
    }
    if (hinderCategorized.statuses.length > 0) {
      hinderParts.push(TagFormatter.formatStatuses(hinderCategorized.statuses));
    }
    if (hinderWeaknesses.length > 0) {
      hinderParts.push(TagFormatter.formatWeaknesses(hinderWeaknesses));
    }
    
    const hinderFormatted = hinderParts.length > 0
      ? `\`\`\`ansi\n${hinderParts.join(', ')}\n\`\`\``
      : 'None';

    return hinderFormatted;
  }

  /**
   * Format roll result using Components V2
   * @param {number} die1 - First die result
   * @param {number} die2 - Second die result
   * @param {number} baseRoll - Sum of dice
   * @param {number} modifier - Power modifier
   * @param {number} finalResult - Final roll result
   * @param {string|null} description - Optional description of what the roll is for
   * @param {string|null} narratorMention - Optional narrator mention to include
   * @param {boolean} isReaction - Whether this is a reaction roll
   * @param {number|null} reactionToRollId - Original roll ID if this is a reaction
   * @returns {Object} Object with components array and IsComponentsV2 flag
   */
  static formatRollResult(die1, die2, baseRoll, modifier, finalResult, description, narratorMention = null, isReaction = false, reactionToRollId = null, strategyName = null, strategyModifier = 0, originalPower = null, spendingPower = null) {
    const modifierText = modifier >= 0 ? `+${modifier}` : `${modifier}`;
    
    // Build roll calculation text with strategy modifier if applicable
    let rollCalculation = `${die1} + ${die2} = ${baseRoll}`;
    if (strategyModifier !== 0) {
      const strategyModText = strategyModifier >= 0 ? `+${strategyModifier}` : `${strategyModifier}`;
      rollCalculation += ` ${strategyModText} (${strategyName})`;
    }
    rollCalculation += ` ${modifierText} (Power) = **${finalResult}**`;

    // Determine result classification
    // For reaction rolls, use different thresholds
    let resultType;
    let isAutomatic = false;
    let reactionOutcome = null;
    
    if (isReaction) {
      // Reaction roll outcomes
      if (finalResult >= 10) {
        resultType = 'Reaction: Spend Power +1';
        reactionOutcome = 'Spend your Power plus 1, on any Effect';
      } else if (finalResult >= 7) {
        resultType = 'Reaction: Spend Power';
        reactionOutcome = 'Spend your Power, only to lessen the Consequences';
      } else {
        resultType = 'Reaction: Suffer Consequences';
        reactionOutcome = 'Suffer the Consequences as-is';
      }
    } else {
      // Regular roll outcomes
      // Special cases: double 1's = automatic failure, double 6's = automatic success
      if (die1 === 1 && die2 === 1) {
        resultType = 'Consequences';
        isAutomatic = true;
      } else if (die1 === 6 && die2 === 6) {
        resultType = 'Success';
        isAutomatic = true;
      } else if (finalResult >= 10) {
        resultType = 'Success';
      } else if (finalResult >= 7) {
        resultType = 'Success & Consequences';
      } else {
        resultType = 'Consequences';
      }
    }

    // Build Components V2 structure for roll result
    const container = new ContainerBuilder();
    
    // Add title text display
    const rollType = isReaction ? 'Reaction Roll' : 'Roll Result';
    const reactionPrefix = isReaction && reactionToRollId ? `(to Roll #${reactionToRollId}) ` : '';
    let resultText = `## ${reactionPrefix}${description || rollType}\n**Result: ${finalResult}** (${resultType})`;
    
    if (isReaction && reactionOutcome) {
      resultText += `\n*${reactionOutcome}*`;
    } else if (isAutomatic) {
      if (die1 === 1 && die2 === 1) {
        resultText += '\n*Double 1\'s - Automatic Consequences*';
      } else if (die1 === 6 && die2 === 6) {
        resultText += '\n*Double 6\'s - Automatic Success*';
      }
    }
    container.addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(resultText)
    );
    
    // Add dice and power in a single line for clarity
    container.addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(`### Roll\n${rollCalculation}`)
    );
    
    // Add strategy and spending power information
    let spendingText = strategyName ? `*${strategyName}*\n` : '';
    if (spendingPower !== null) {
      spendingText += `*You may spend  ${spendingPower} Power*`;
    } else {
      spendingText += `*Roll was not successful - no power to spend*`;
    }
    container.addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(spendingText)
    );

    // Add narrator mention if provided
    if (narratorMention) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(`Confirmed by: ${narratorMention}`)
      );
    }

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2
    };
  }
}

